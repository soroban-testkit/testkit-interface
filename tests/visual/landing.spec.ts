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

    await page.getByRole("tab", { name: "limits" }).click();
    await expect(commands).toHaveScreenshot("commands-limits.png");

    await page.getByRole("tab", { name: "audit" }).click();
    await expect(commands).toHaveScreenshot("commands-audit.png");
  });

  test("full page matches the baseline", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot("full-page.png", {
      fullPage: true,
    });
  });
});
