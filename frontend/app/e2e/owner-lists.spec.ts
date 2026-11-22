import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The owner's lists end to end on stubs (WP-82, SCR-032, SCR-049, SCR-057, SCR-058), with the cabinet on, in cookie
 * and header mode: the group «Сдаю квартиру» at the limit opens the limit sheet, whose «Мои объявления» opens the list
 * over Settings; the list's tabs, a status change by a Server Action with its toast; «Отклики» of the stub listing
 * with requests and an answer; and a second «Сдать квартиру» in one launch sends a second create (WP-81's kept
 * `/owner/new` copy, keyed on `bfcacheId`).
 */

const ACTIVE = "01JF0000000000000000000003";
const DRAFT = "01JF0000000000000000000001";

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const back = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked"));

const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
function actions(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isServerAction(request)) {
      sent.push(request);
    }
  });
  return sent;
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`owner lists (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-049" }, { type: "screen", description: "SCR-057" }, { type: "screen", description: "SCR-058" }] }, () => {
    test("at the limit «Сдать квартиру» opens the limit sheet; «Мои объявления» opens the list over Settings", async ({ page }) => {
      await stubMedia(page);
      await launchApp(page, { mode, path: "/settings" });
      const group = page.locator('[data-settings-group="owner"]');
      await expect(group).toBeVisible();
      await expect(group.locator('[data-settings-row="owner-new"] [data-settings-value]')).toHaveText("2 из 2");

      await group.locator('[data-settings-row="owner-new"]').click();
      await expect(page).toHaveURL(/\/ru\/owner\/limit\?where=settings$/);
      await expect(visible(page, '[data-route="owner/limit"]')).toBeVisible();
      await visible(page, '[data-route="owner/limit"] [data-action="mine"]').click();

      await expect(page).toHaveURL(/\/ru\/settings\/owner$/);
      await expect(visible(page, `[data-owner-card="${ACTIVE}"]`)).toBeVisible();
      await back(page);
      await expect(page).toHaveURL(/\/ru\/settings$/);
    });

    test("the list: the tabs, «Пауза» by a Server Action with its toast, «Отклики» and an answer", async ({ page }) => {
      await stubMedia(page);
      const sent = actions(page);
      await launchApp(page, { mode, path: "/settings/owner" });
      const card = visible(page, `[data-owner-card="${ACTIVE}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator("[data-owner-new-requests]")).toHaveText("2 новых отклика");
      await expect(visible(page, `[data-owner-card="${DRAFT}"]`)).toBeVisible();

      await card.locator('[data-action="pause"]').click();
      await expect(appToast(page)).toHaveText("На паузе: в ленту и радар не уходит");
      expect(sent.length).toBeGreaterThan(0);

      await page.getByRole("radio", { name: "История" }).click();
      await expect(visible(page, '[data-owner-card="01JF0000000000000000000008"]')).toBeVisible();
      await page.getByRole("radio", { name: "Актуальные" }).click();

      await card.locator('[data-action="requests"]').click();
      await expect(page).toHaveURL(new RegExp(`/ru/settings/owner/${ACTIVE}/requests$`));
      const first = visible(page, '[data-request="01JF0000000000000000000201"]');
      await expect(first).toBeVisible();
      await first.locator('[data-action="give"]').click();
      await expect(first).toHaveAttribute("data-request-state", "given");
      await expect(appToast(page)).toHaveText("Номер отправили — человек позвонит вам сам");

      // The list stays mounted below «Отклики»: Back finds it on its tab.
      await back(page);
      await expect(page).toHaveURL(/\/ru\/settings\/owner$/);
      await expect(card).toBeVisible();
    });

    test("a second «Сдать квартиру» in one launch sends a second create (WP-81's kept copy)", async ({ page }) => {
      await stubMedia(page);
      await setScenario(page, "owner_empty");
      const sent = actions(page);
      await launchApp(page, { mode, path: "/settings" });
      const row = page.locator('[data-settings-row="owner-new"]');
      await expect(row.locator("[data-settings-value]")).toHaveText("Бесплатно");
      await expect(page.locator('[data-settings-row="owner-mine"]')).toHaveCount(0);

      await row.click();
      await expect(page).toHaveURL(/\/ru\/owner\/[0-9A-Z]{26}\/place\?first=1$/);
      const first = sent.length;
      expect(first).toBeGreaterThan(0);
      await back(page);
      await expect(page).toHaveURL(/\/ru\/settings$/);

      await row.click();
      await expect(page).toHaveURL(/\/ru\/owner\/[0-9A-Z]{26}\/place\?first=1$/);
      expect(sent.length).toBeGreaterThan(first);
    });
  });
}
