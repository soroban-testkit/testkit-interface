import { expect, test, type Page } from "@playwright/test";

test.describe("keyboard-only navigation (#109)", () => {
  test("skip link moves keyboard focus past the navigation to the page content", async ({ page }) => {
    await page.goto("/");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    // Chromium's initial page focus can vary across runner environments.
    // Explicitly focus the first keyboard link and test its real Enter behavior.
    await skipLink.focus();
    await expect(skipLink).toBeFocused();

    // The link sits off-screen until it receives focus; it must be on-screen then.
    const box = await skipLink.boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);

    await page.keyboard.press("Enter");
    await expect(page.locator("#top")).toBeFocused();
  });

  test("every focusable control shows an outline when it receives keyboard focus", async ({ page }) => {
    await page.goto("/");
    const offenders: string[] = [];
    let visited = 0;
    for (let i = 0; i < 150; i += 1) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        return {
          label: `${element.tagName.toLowerCase()}:${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 40)}`,
          outlineStyle: style.outlineStyle,
          outlineWidth: parseFloat(style.outlineWidth),
        };
      });
      // Tabbing past the last control returns focus to the document body.
      if (!state) break;
      visited += 1;
      if (state.outlineStyle !== "solid" || state.outlineWidth < 2) offenders.push(state.label);
    }

    expect(visited).toBeGreaterThan(40);
    expect(offenders).toEqual([]);
  });

  test("workflow tabs respond to arrow keys in a real browser", async ({ page }) => {
    await page.goto("/");

    const coverageTab = page.getByRole("tab", { name: /coverage workflow/i });
    const workspaceTab = page.getByRole("tab", { name: /cargo workspace/i });
    await coverageTab.focus();
    await page.keyboard.press("ArrowRight");

    await expect(workspaceTab).toBeFocused();
    await expect(workspaceTab).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("screen reader structure (#108)", () => {
  test("exposes the main landmark, the named navigation, and a single level-one heading", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("announces the navigation links with their names and targets", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("navigation", { name: "Main navigation" })).toMatchAriaSnapshot(`
      - navigation "Main navigation":
        - link "Soroban Testkit home"
        - link "Install"
        - link "Modules"
        - link "Commands"
        - link "GitHub ↗"
    `);
  });

  test("announces the command selector as tabs with an associated panel", async ({ page }) => {
    await page.goto("/");

    const tabs = page.getByRole("tablist", { name: "Command workflow selector" });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "coverage" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "coverage" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Example Soroban test" })).toBeVisible();
  });

  test("announces the result of copying a command", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");

    await page.getByRole("button", { name: "Copy", exact: true }).click();

    await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Command copied to clipboard" })).toHaveCount(1);
  });

  test("limits example commands are keyboard-focusable in workflow order", async ({ page }) => {
    await page.goto("/");

    const cloneCommand = page.getByRole("region", { name: "Clone the Sororail contract workspace" });
    const targetCommand = page.getByRole("region", { name: "Add the wasm32v1-none target" });
    const buildCommand = page.getByRole("region", { name: "Build the batch-payout contract" });
    const runCommand = page.getByRole("region", { name: "Run the limits example" });

    await cloneCommand.focus();
    await expect(cloneCommand).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(targetCommand).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(buildCommand).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(runCommand).toBeFocused();
  });
});

// 200% zoom on a 1280px layout is 640 CSS px. WCAG 1.4.10 reflow is 320 CSS px
// (400% zoom on 1280px). Both must keep every control on screen.
const zoomWidths = [
  { name: "200% zoom (640px)", width: 640 },
  { name: "320px reflow (WCAG 1.4.10)", width: 320 },
];

const workbenchStates: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: "default coverage builder", open: async () => {} },
  {
    name: "limits workflow",
    open: async (page) => page.getByRole("tab", { name: "limits" }).click(),
  },
  {
    name: "audit workflow",
    open: async (page) => page.getByRole("tab", { name: "audit" }).click(),
  },
  {
    name: "advanced editor open",
    open: async (page) => page.getByRole("button", { name: "Advanced arguments" }).click(),
  },
  {
    name: "comparison panel open",
    open: async (page) => page.getByRole("button", { name: "Compare two configurations" }).click(),
  },
  {
    name: "workflow guides expanded",
    open: async (page) => {
      await page.getByRole("button", { name: "Show guide", exact: true }).first().click();
      await page.getByRole("button", { name: "Show tutorial" }).click();
    },
  },
];

test.describe("200% zoom and reflow (#110)", () => {
  for (const viewport of zoomWidths) {
    for (const state of workbenchStates) {
      test(`${state.name} keeps controls on screen at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: 900 });
        await page.goto("/");
        await state.open(page);
        // Navigation and accessibility inspection should not race smooth-scroll
        // animations triggered by clicking a command workflow.
        await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: "instant" }));

        // A workflow switch may briefly reposition the builder. Assert the
        // settled layout, not an intermediate frame, without hiding persistent
        // horizontal overflow or clipped controls.
        await expect.poll(async () => page.evaluate((vw) => {
          const offenders: string[] = [];
          document.querySelectorAll<HTMLElement>("main a[href], main button, main input, main select, main textarea").forEach((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            if (rect.right > vw + 0.5 || rect.left < -0.5) {
              offenders.push(`${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 40)}"`);
            }
          });
          return {
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            offenders,
            x: window.scrollX,
            innerWidth: window.innerWidth,
            documentWidth: document.documentElement.clientWidth,
            first: document.querySelector<HTMLElement>("main a[href]")?.getBoundingClientRect().toJSON(),
          };
        }, viewport.width), {
          message: "the settled page must have no horizontal overflow or clipped controls",
          timeout: 10_000,
        }).toMatchObject({ horizontalOverflow: false, offenders: [], x: 0 });
      });
    }
  }
});

test.describe("focus return (#111)", () => {
  // The reset confirmation is a native window.confirm(), not an in-page
  // dialog. The rule in src/focusReturn.ts is for in-page surfaces, so this
  // test checks the browser already returns focus to the trigger.
  for (const outcome of ["accept", "dismiss"] as const) {
    test(`focus returns to Reset builder after the native reset confirmation is ${outcome}ed`, async ({ page }) => {
      await page.goto("/");
      const resetButton = page.getByRole("button", { name: "Reset builder" });
      await resetButton.focus();

      page.once("dialog", (dialog) => (outcome === "accept" ? dialog.accept() : dialog.dismiss()));
      await page.keyboard.press("Enter");

      await expect(resetButton).toBeFocused();
    });
  }
});

 fix/command-shell-mobile-tabs-copy-12-15
// Issue #13: the mobile menu must open immediately below the navigation at
// 320px and remain keyboard-operable even with a short viewport.
test("mobile navigation remains reachable on a narrow short screen (#13)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/");
  const menuToggle = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menuToggle).toBeVisible();
  await menuToggle.click();
  const menu = page.locator("#mobile-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Commands" })).toBeVisible();

  const positions = await page.evaluate(() => {
    const nav = document.querySelector("nav")!.getBoundingClientRect();
    const links = document.querySelector("#mobile-menu")!.getBoundingClientRect();
    return { navBottom: nav.bottom, menuTop: links.top, menuRight: links.right, menuBottom: links.bottom };
  });
  expect(Math.abs(positions.menuTop - positions.navBottom)).toBeLessThanOrEqual(1);
  expect(positions.menuRight).toBeLessThanOrEqual(321);
  expect(positions.menuBottom).toBeLessThanOrEqual(481);

  await menu.getByRole("link", { name: "Commands" }).focus();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuToggle).toBeFocused();

// Issue #330 — DOM/tab order must match the visual left-to-right switcher order
test.describe("workflow switcher order (#330)", () => {
  for (const width of [1280, 900, 640, 540, 320]) {
    test(`keeps command and workflow tabs in reading order at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      const switchers = [
        '[role="group"][aria-label="Command workflow selector"] > button',
        '[role="tablist"][aria-label="Soroban workflow docs"] > button',
      ];

      for (const selector of switchers) {
        const boxes = await page.locator(selector).evaluateAll((elements) =>
          elements.map((element) => {
            const { x, y } = element.getBoundingClientRect();
            return { x, y };
          }),
        );

        expect(boxes.length).toBeGreaterThan(1);
        for (let index = 1; index < boxes.length; index += 1) {
          const previous = boxes[index - 1];
          const current = boxes[index];
          if (Math.abs(current.y - previous.y) < 4) {
            expect(current.x, `${selector} must flow left-to-right`).toBeGreaterThan(previous.x);
          } else {
            expect(current.y, `${selector} must wrap top-to-bottom`).toBeGreaterThan(previous.y);
          }
        }
      }
    });
  }
});

// Issue #331 — portrait phone module list tap targets
test.describe("portrait phone tap targets (#331)", () => {
  for (const width of [539, 375, 320]) {
    test(`gives module list controls at least 44px at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await page.getByRole("searchbox", { name: /search modules by name or description/i }).fill("core");

      const offenders = await page.evaluate(() => {
        const selector = ".module-filter-clear, .category-chip, .module-card-select, .module-card-links a";
        return Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter((element) => element.getBoundingClientRect().width > 0)
          .map((element) => ({
            label: (element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 40),
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          }))
          .filter((box) => box.width < 44 || box.height < 44);
      });

      expect(offenders).toEqual([]);
    });
  }
});

test.describe("command history keyboard dismissal (#343)", () => {
  test("Escape and clearing history restore focus to persistent controls", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    const toggle = page.getByRole("button", { name: "Show (1)" });
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await page.keyboard.press("Enter");
    const copyHistory = page.getByRole("button", { name: "Copy history command 1" });
    await copyHistory.focus();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("log")).toHaveCount(0);
    await expect(toggle).toBeFocused();

    await page.keyboard.press("Enter");
    const clear = page.getByRole("button", { name: "Clear history" });
    await clear.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Command history" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copied" })).toBeFocused();
  });
});
test.describe("Coverage report format semantics (#324)", () => {
  test("announces the report-format radio group and checked state", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("radiogroup", { name: "Report format" });
    await expect(group).toHaveAttribute("aria-describedby", "format-help");
    await expect(group).toMatchAriaSnapshot(`
      - radiogroup "Report format":
        - radio "html" [checked]
        - radio "lcov"
        - radio "text"
    `);
    await group.getByRole("radio", { name: "lcov" }).check();
    await expect(group.getByRole("radio", { name: "lcov" })).toBeChecked();
    await expect(group.getByRole("radio", { name: "html" })).not.toBeChecked();
  });
});

test.describe("Multiline command editor virtual cursor (#334)", () => {
  test("exposes a labelled textarea, visible help, and a stable disclosure state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "audit" }).click();

    const toggle = page.getByRole("button", { name: "Advanced arguments" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "advanced-command-panel");
    await expect(page.locator("#advanced-command-panel")).toBeHidden();

    await toggle.click();

    const editor = page.getByRole("textbox", { name: "Advanced command editor" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute("aria-describedby", "advanced-command-help");
    await expect(page.locator("#advanced-command-help")).toContainText("backslash");
    await expect(page.getByRole("button", { name: "Apply multiline command" })).toBeVisible();
  });
});

test.describe("Module filter Escape behaviour (#336)", () => {
  test("Escape clears the filter and keeps focus on the search box", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "Search modules by name or description" });

    await search.fill("ledger");
    await expect(page.getByRole("heading", { name: "ledger", level: 3 })).toBeVisible();

    await search.press("Escape");

    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page.getByRole("heading", { name: "core", level: 3 })).toBeVisible();
  });
});

test.describe("Module-card state announcements (#337)", () => {
  test("exposes a stable panel reference and both aria-expanded states", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Show core module summary" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "module-details-core");
    await expect(page.locator("#module-details-core")).toBeHidden();
    await toggle.click();
    const expanded = page.getByRole("button", { name: "Hide core module summary" });
    await expect(expanded).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#module-details-core")).toBeVisible();
    await expanded.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#module-details-core")).toBeHidden();
  });
});

test.describe("Module filter usability in the tablet grid (#263)", () => {
  for (const width of [601, 768, 900]) {
    test(`keeps the filter readable and tall enough without zoom at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto("/");

      const search = page.getByRole("searchbox", { name: "Search modules by name or description" });
      const metrics = await search.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          fontSize: parseFloat(style.fontSize),
          height: rect.height,
          width: rect.width,
          left: rect.left,
          right: rect.right,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });

      expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
      expect(metrics.height).toBeGreaterThanOrEqual(44);
      expect(metrics.width).toBeGreaterThanOrEqual(240);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(width + 0.5);
      expect(metrics.overflow).toBe(false);

      await search.fill("ledger");
      await expect(page.getByRole("article", { name: "ledger" })).toBeVisible();
      await expect(page.getByRole("article", { name: "money" })).toHaveCount(0);
    });
  }
});

test.describe("Preflight checklist touch targets (#260)", () => {
  test("expand/collapse controls are at least 44px tall on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const toggles = page.locator(".guide-card .guide-header .preflight-toggle");
    expect(await toggles.count()).toBe(2);
    for (let i = 0; i < await toggles.count(); i += 1) {
      const box = await toggles.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Placeholder text contrast (#327)", () => {
  test("uses opaque, AA-contrast placeholder text", async ({ page }) => {
    await page.goto("/");
    const contrast = await page.locator("#module-search").evaluate((input) => {
      const style = getComputedStyle(input);
      const placeholder = getComputedStyle(input, "::placeholder");
      const rgb = (value: string): number[] => {
        if (value.startsWith("#")) {
          const hex = value.slice(1);
          return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
        }
        return (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      };
      const lum = (v: number[]) => v.map((n) => {
        const c = n / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
      const canvas = rgb(getComputedStyle(document.documentElement).getPropertyValue("--color-canvas").trim());
      const inputRgb = rgb(style.backgroundColor);
      const alpha = Number(style.backgroundColor.match(/[,/]\s*([\d.]+)\s*\)$/)?.[1] ?? "1");
      const background = inputRgb.map((n, index) => n * alpha + canvas[index] * (1 - alpha));
      const a = lum(background);
      const b = lum(rgb(placeholder.color));
      return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), opacity: placeholder.opacity };
    });
    expect(contrast.opacity).toBe("1");
    expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("Required vs Optional badge contrast (#265)", () => {
  for (const surface of ["dark", "light"] as const) {
    test(`badge text meets WCAG AA on ${surface} surfaces`, async ({ page }) => {
      await page.goto("/");
      if (surface === "light") {
        await page.addStyleTag({
          content: `:root {
            --color-badge-required-bg: var(--color-badge-required-bg-light);
            --color-badge-required-text: var(--color-badge-required-text-light);
            --color-badge-optional-bg: var(--color-badge-optional-bg-light);
            --color-badge-optional-text: var(--color-badge-optional-text-light);
          }`,
        });
      }

      const measured = await page.evaluate(() => {
        const parse = (value: string): number[] => {
          if (value.startsWith("#")) {
            const hex = value.slice(1);
            return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)).concat(1);
          }
          const channels = (value.match(/[\d.]+/g) ?? []).map(Number);
          return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
        };
        const luminance = (channels: number[]): number => {
          const [red, green, blue] = channels.slice(0, 3).map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const canvas = parse(
          getComputedStyle(document.documentElement).getPropertyValue("--color-canvas").trim(),
        ).slice(0, 3);
        const measure = (element: HTMLElement) => {
          const style = getComputedStyle(element);
          const [red, green, blue, alpha] = parse(style.backgroundColor);
          const background = [red, green, blue].map((channel, index) =>
            channel * alpha + canvas[index] * (1 - alpha),
          );
          const foregroundLuminance = luminance(parse(style.color));
          const backgroundLuminance = luminance(background);
          return {
            label: element.textContent?.trim() ?? "",
            ratio:
              (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
              (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
          };
        };
        const optional = [...document.querySelectorAll<HTMLElement>(".badge-optional")].find(
          (element) => element.textContent?.trim() === "Optional",
        );
        const required = document.querySelector<HTMLElement>(".badge-required");
        if (!required || !optional) return [];
        return [measure(required), measure(optional)];
      });

      expect(measured.map((item) => item.label)).toEqual(["Required", "Optional"]);
      for (const item of measured) {
        expect(item.ratio).toBeGreaterThanOrEqual(4.5);
      }
      await expect(page.locator('input[aria-required="true"]').first()).toHaveAttribute("aria-required", "true");
    });
  }
 main
});
