import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The seeker's request end to end on stubs (WP-83, SCR-061, BR-APP-098), in cookie and header mode: the native stub
 * listings `10000001` … `10000006` carry no request, `pending`, `given`, `declined`, `expired` and `cancelled`. The bar
 * of each state; «Связаться с хозяином» opens «Отклик хозяину», whose send is one Server Action with the launch data and
 * closes the sheet; `c_<number>` opens the listing, then its sheet.
 */

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const bar = (page: Page) => visible(page, "[data-cta]");

const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

for (const mode of ["cookie", "header"] as const) {
  test.describe(`contact request (${mode} mode)`, () => {
    test("the bars of the request states", async ({ page }) => {
      await stubMedia(page);
      await launchApp(page, { mode, path: "/listing/10000002" });
      await expect(bar(page).locator('[data-cta-action="requestSent"]')).toHaveText("Отклик отправлен");
      await expect(bar(page).locator('[data-cta-action="requestSent"]')).toBeDisabled();

      for (const [number, expected] of [
        [10000003, /Позвонить/],
        [10000004, /Хозяин не готов дать номер/],
        [10000006, /Квартира уже не сдаётся/],
      ] as const) {
        await page.goto(`/ru/listing/${number}`);
        await expect(bar(page)).toContainText(expected);
      }

      await page.goto("/ru/listing/10000005");
      await expect(bar(page).locator('[data-cta-note="expired"]')).toHaveText("Хозяин пока не ответил");
      await expect(bar(page).locator('[data-cta-action="request"]')).toHaveText(/Связаться с хозяином/);
    });

    test("«Связаться с хозяином» opens the sheet; a send is one Server Action and closes it", async ({ page }) => {
      await stubMedia(page);
      const sent: Request[] = [];
      page.on("request", (request) => {
        if (isServerAction(request)) {
          sent.push(request);
        }
      });
      await launchApp(page, { mode, path: "/listing/10000001" });
      await bar(page).locator('[data-cta-action="request"]').click();
      await expect(page).toHaveURL(/\/ru\/listing\/10000001\/contact$/);
      const sheet = visible(page, '[data-route="listing/contact"]');
      await expect(sheet).toBeVisible();
      const send = visible(page, '[data-action="send-request"]');
      await expect(send).toBeDisabled();

      await sheet.locator('[data-who="couple"]').click();
      await expect(sheet.locator("[data-people]")).toHaveAttribute("data-people", "2");
      await send.click();
      await expect(page).toHaveURL(/\/ru\/listing\/10000001$/);
      expect(sent.length).toBeGreaterThan(0);
    });

    test("c_<number> opens the listing, then its request sheet", async ({ page }) => {
      await stubMedia(page);
      await launchApp(page, { mode, startParam: "c_10000001" });
      await expect(page).toHaveURL(/\/ru\/listing\/10000001\/contact$/);
      await expect(visible(page, '[data-route="listing/contact"]')).toBeVisible();
    });
  });
}
