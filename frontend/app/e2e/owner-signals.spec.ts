import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The owner's signals end to end on stubs (WP-82, SCR-060, DEV-059), in cookie and header mode, with the profile of
 * the stub scenario `owner_pending` (two requests waiting; every other profile has none, so no other spec sees them):
 * the red dot on Settings, the tab tip over the feed; a tap on the tip opens «Мои объявления» with the card tip on the
 * listing with requests; opening its requests dismisses both tips for good (`homi-req-tip`).
 */

const ACTIVE = "01JF0000000000000000000003";

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });

for (const mode of ["cookie", "header"] as const) {
  test.describe(`owner signals (${mode} mode)`, () => {
    test("the dot and the tab tip; the tip opens the list with the card tip; the requests dismiss both", async ({ page }) => {
      await stubMedia(page);
      await page.context().addCookies([{ name: "homi_stub_scenario", value: "owner_pending", url: test.info().project.use.baseURL }]);
      await launchApp(page, { mode, path: "/" });
      await expect(page.locator('[data-tab="settings"] [data-tab-dot]')).toHaveAttribute("data-tab-dot", "2");
      const tabTip = visible(page, '[data-request-tip="tab"]');
      await expect(tabTip).toContainText("Пришёл первый отклик!");

      await tabTip.locator('[data-action="tip-open"]').click();
      await expect(page).toHaveURL(/\/ru\/settings\/owner$/);
      const cardTip = visible(page, `[data-owner-card="${ACTIVE}"] [data-request-tip="card"]`);
      await expect(cardTip).toHaveText(/Вот здесь ваши отклики/);

      await cardTip.locator('[data-action="tip-open"]').click();
      await expect(page).toHaveURL(new RegExp(`/ru/settings/owner/${ACTIVE}/requests$`));
      await expect.poll(() => page.evaluate(() => window.localStorage.getItem("homi-req-tip"))).toBe("done");
      await expect(page.locator('[data-request-tip="card"]').filter({ visible: true })).toHaveCount(0);
    });
  });
}
