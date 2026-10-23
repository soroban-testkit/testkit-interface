import { expect, test } from "@playwright/test";

test.describe("landing page visual regression", () => {
  test("hero section matches the baseline", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#top")).toHaveScreenshot("hero.png");
  });

  test("modules section matches the baseline", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#modules")).toHaveScreenshot("modules.png");
  });

  test("command workbench matches the baseline for each tab", async ({
    page,
  }) => {
    await page.goto("/");
    const commands = page.locator("#commands");

    await expect(commands).toHaveScreenshot("commands-coverage.png");

    await page.getByRole("button", { name: "limits" }).click();
    await expect(commands).toHaveScreenshot("commands-limits.png");

    await page.getByRole("button", { name: "audit" }).click();
    await expect(commands).toHaveScreenshot("commands-audit.png");
  });

  test("full page matches the baseline", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot("full-page.png", {
      fullPage: true,
    });
  });
});

test.describe("responsive layout enhancements", () => {
  test("large-text hero layout renders correctly at 1200px+ (#184)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero).toHaveScreenshot("hero-large-text.png");
  });

  test("navigation links do not wrap awkwardly on small screens (#180)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav).toHaveScreenshot("nav-small-screen.png");
  });

  test("two-column module layout displays correctly on tablet (#182)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    const modules = page.locator("#modules");
    await expect(modules).toHaveScreenshot("modules-tablet.png");
  });

  test("landscape phone command form layout is optimized (#183)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 480 });
    await page.goto("/");
    const commands = page.locator("#commands");
    await expect(commands).toHaveScreenshot("commands-landscape-phone.png");
  });
});
