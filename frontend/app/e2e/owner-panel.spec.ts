import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The user's own listing end to end on stubs (WP-82, SCR-059, BR-APP-103), in cookie and header mode: the stub
 * listing `10000008` is the stub user's (`owner.mine`, `owner.listing_id` `01JF…03`). The title row keeps only
 * «Поделиться», the panel «Ваше объявление» shows under the key facts with «2 человека ждут ответа», the footer holds
 * the panel's actions in place of the contact bar, «Ответить» opens «Отклики» over the listing and Back returns to it.
 */

const NUMBER = 10000008;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const back = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked"));

for (const mode of ["cookie", "header"] as const) {
  test.describe(`owner panel (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-059" }] }, () => {
    test("the own listing: no heart or «⋯», the panel, its footer, and «Отклики» over the listing", async ({ page }) => {
      await stubMedia(page);
      await launchApp(page, { mode, path: `/listing/${NUMBER}` });
      const panel = visible(page, "[data-owner-panel]");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("Ваше объявление");
      await expect(panel.locator('[data-action="answer"]')).toContainText("2 человека ждут ответа");

      const titleRow = visible(page, "[data-title-row]");
      await expect(titleRow.locator('[data-action="menu"]')).toHaveCount(0);
      await expect(visible(page, "[data-owner-footer]")).toBeVisible();
      await expect(visible(page, '[data-owner-footer] [data-action="requests"] [data-requests-badge]')).toHaveText("2");
      await expect(visible(page, "[data-cta-action]")).toHaveCount(0);

      await panel.locator('[data-action="answer"]').click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${NUMBER}/requests$`));
      await expect(visible(page, '[data-request="01JF0000000000000000000201"]')).toBeVisible();

      await back(page);
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${NUMBER}$`));
      await expect(panel).toBeVisible();
    });
  });
}
