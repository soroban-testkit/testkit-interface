import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y, getViolations } from "axe-playwright";
import type { Result } from "axe-core";

test.describe("Accessibility", () => {
  test("landing page has no critical a11y violations", async ({ page }) => {
    await page.goto("/en");
    await injectAxe(page);

    await checkA11y(page, undefined, {
      axeOptions: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      },
      includedImpacts: ["critical", "serious"],
      detailedReport: false,
    });
  });

  test("returns violation list programmatically for landing page", async ({ page }) => {
    await page.goto("/en");
    await injectAxe(page);

    const violations: Result[] = await getViolations(page, undefined, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa"],
      },
    });

    for (const v of violations) {
      expect.soft(v.impact, `Rule ${v.id} impact`).not.toBe("critical");
    }
  });
});
