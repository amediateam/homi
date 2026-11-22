import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The invitations into the cabinet and the survey's landlord block end to end on stubs (WP-82 part 2, BR-APP-115,
 * BR-APP-116, DEC-89, DEC-91), with the cabinet on, in cookie and header mode: the row under the few-results note of a
 * short feed (`few`), the line under an empty one (`empty`), «Тоже сдаёте квартиру?» on a listing whose card says
 * `owner.entry` and none on the user's own; the stub account is full (`can_add: false`), so a tap opens «Мои
 * объявления» from Settings. The survey's `done` step shows no landlord block in this build, which has neither a bot
 * name nor the owners' page.
 */

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });

for (const mode of ["cookie", "header"] as const) {
  test.describe(`owner entry (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-007" }, { type: "screen", description: "SCR-050" }] }, () => {
    test("a short feed's end row and an empty feed's line open «Мои объявления» for a full account", async ({ page }) => {
      await stubMedia(page);
      await setScenario(page, "few");
      await launchApp(page, { mode, path: "/" });
      const row = visible(page, '[data-feed-end] [data-owner-entry="feed_end"]');
      await expect(row).toHaveText("Сдаёте квартиру? Разместите бесплатно");
      await row.click();
      await expect(page).toHaveURL(/\/ru\/settings\/owner$/);

      await setScenario(page, "empty");
      await page.goto("/ru");
      await expect(visible(page, '[data-owner-entry="empty"]')).toContainText("Разместите бесплатно ›");
    });

    test("a listing offers «Тоже сдаёте квартиру?» by its owner.entry; the user's own listing does not", async ({ page }) => {
      await stubMedia(page);
      await launchApp(page, { mode, path: "/listing/10000001" });
      await expect(visible(page, '[data-owner-entry="listing"]')).toHaveText("Тоже сдаёте квартиру? Разместите бесплатно ›");

      await page.goto("/ru/listing/10000008");
      await expect(visible(page, "[data-owner-panel]")).toBeVisible();
      await expect(page.locator('[data-owner-entry="listing"]')).toHaveCount(0);
    });

    test("the survey's «Да, через HOMI» without a bot name and an owners' page shows no landlord block", async ({ page }) => {
      // The e2e build sets no NEXT_PUBLIC_TELEGRAM_BOT_USERNAME and WP-61 has not built the owners' page: with neither
      // there is no block (DEC-91's fallback, a default of the integrator); its buttons are component tests
      // (`tests/owner/OwnerEntry.test.tsx`).
      await stubMedia(page);
      await launchApp(page, { mode, path: "/radars/found?trigger=pause" });
      await visible(page, '[data-found="homi"]').click();
      await expect(visible(page, '[data-route="radars/found"][data-step="done"]')).toBeVisible();
      await expect(page.locator("[data-landlord]")).toHaveCount(0);
    });
  });
}
