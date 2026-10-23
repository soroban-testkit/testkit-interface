import { expect, test, type Page } from "@playwright/test";

test.describe("keyboard-only navigation (#109)", () => {
  test("skip link moves keyboard focus past the navigation to the page content", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
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

  test("announces the command selector as a group and the example as a named region", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("group", { name: "Command workflow selector" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Command workflow selector" })).toHaveCount(0);
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
    open: async (page) => page.getByRole("button", { name: "limits" }).click(),
  },
  {
    name: "audit workflow",
    open: async (page) => page.getByRole("button", { name: "audit" }).click(),
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
      await page.getByRole("button", { name: "Show guide" }).click();
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

        const report = await page.evaluate((vw) => {
          const offenders: string[] = [];
          document.querySelectorAll<HTMLElement>("main a[href], main button, main input, main select, main textarea").forEach((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            if (rect.right > vw + 0.5 || rect.left < -0.5) {
              offenders.push(`${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 40)}"`);
            }
          });
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            offenders,
          };
        }, viewport.width);

        expect(report.scrollWidth, "page must not scroll horizontally").toBeLessThanOrEqual(report.clientWidth);
        expect(report.offenders, "controls must not be clipped off-screen").toEqual([]);
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
