import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The owner tiers on a listing end to end on stubs (WP-83, BR-APP-100 … BR-APP-102, SCR-062), in cookie and header
 * mode: the native self-placed `10000001` shows the chip, whose tap opens «Проверенный хозяин» with HOMI's points;
 * it has no «Источник» and its single history entry names HOMI. The claimed `100025` shows its section and no chip.
 */

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });

for (const mode of ["cookie", "header"] as const) {
  test.describe(`listing owner tiers (${mode} mode)`, () => {
    test("a self-placed listing: the chip opens the info sheet; no source section", async ({ page }) => {
      await stubMedia(page);
      await launchApp(page, { mode, path: "/listing/10000001" });
      await expect(page.locator("[data-listing-state='loaded']").first()).toBeVisible();
      const chip = visible(page, "[data-owner-chip] > button");
      await expect(chip).toContainText("Проверенный хозяин");
      await expect(visible(page, '[data-section="sources"]')).toHaveCount(0);

      await chip.click();
      await expect(page).toHaveURL(/\/ru\/listing\/10000001\/owner$/);
      const sheet = visible(page, '[data-route="listing/owner"]');
      await expect(sheet.locator('[data-owner-point="owner.info.selfHomi"]')).toHaveText("Разместил квартиру сам в HOMI.");
      await sheet.locator('[data-action="ok"]').click();
      await expect(page).toHaveURL(/\/ru\/listing\/10000001$/);
    });

    test("a claimed owner: its section, no chip", async ({ page }) => {
      await stubMedia(page);
      await launchApp(page, { mode, path: "/listing/100025" });
      await expect(visible(page, '[data-section="claimed-owner"]')).toContainText("Хозяин — со слов объявления");
      await expect(page.locator("[data-owner-chip]")).toHaveCount(0);
    });
  });
}
