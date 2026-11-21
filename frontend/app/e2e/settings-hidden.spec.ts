import { expect, launchApp, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * «Скрытое» (WP-31, SCR-039) on the stub's hidden list (`hidden/default.json`: two blocked authors, the listings that
 * resolve), in cookie mode and header mode: return an author, return a listing, return all after the confirm; open a
 * hidden listing over the list and come back. The stub stores nothing, so each case starts from the fixture.
 */

const test = base.extend<{ photos: readonly string[] }>({
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  emit(eventType: string): void;
}

const API_MS = 20_000;
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const authors = (page: Page) => visible(page, "[data-hidden-author]");
const listings = (page: Page) => visible(page, "[data-hidden-listing]");

async function open(page: Page, mode: "cookie" | "header", confirm = true): Promise<void> {
  await launchApp(page, { mode, path: "/settings", answers: { confirm } });
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
  const row = visible(page, '[data-settings-row="hidden"]');
  await expect(row).toBeVisible({ timeout: API_MS });
  await row.click();
  await expect(page.getByRole("region", { name: "Скрытое" })).toBeVisible();
  await expect(authors(page)).toHaveCount(2);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`settings: hidden (${mode} mode)`, () => {
    test("«Вернуть» on an author and on a listing removes the row; the count follows", async ({ page }) => {
      await open(page, mode);
      await expect(authors(page).first()).toContainText("Номер ·");
      const listingCount = await listings(page).count();
      expect(listingCount).toBeGreaterThan(0);

      await authors(page).first().locator("[data-hidden-return]").click();
      await expect(authors(page)).toHaveCount(1);
      await listings(page).first().locator("[data-hidden-return]").click();
      await expect(listings(page)).toHaveCount(listingCount - 1);

      await press(page, "backButtonClicked");
      await expect(visible(page, '[data-settings-row="hidden"] [data-settings-value]')).toHaveText(String(listingCount));
    });

    test("«Показать всё снова» asks first; Cancel keeps everything, OK leaves «Ничего не скрыто»", async ({ page }) => {
      await open(page, mode, false);
      await visible(page, "[data-hidden-all]").click();
      await expect(authors(page)).toHaveCount(2);
      await page.reload();
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });

      await launchApp(page, { mode, path: "/settings/hidden", answers: { confirm: true } });
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await expect(authors(page)).toHaveCount(2, { timeout: API_MS });
      await visible(page, "[data-hidden-all]").click();
      await expect(page.getByText("Ничего не скрыто")).toBeVisible();
      await expect(visible(page, "[data-hidden-all]")).toHaveCount(0);
    });

    test("a hidden listing opens over the list; Back returns to it", async ({ page }) => {
      await open(page, mode);
      const first = listings(page).first();
      const number = await first.getAttribute("data-hidden-listing");
      await first.locator("[data-hidden-open]").click();

      await expect(visible(page, `[data-route="listing"]`)).toBeVisible({ timeout: API_MS });
      expect(new URL(page.url()).pathname).toBe(`/ru/listing/${number}`);
      await press(page, "backButtonClicked");
      await expect(page.getByRole("region", { name: "Скрытое" })).toBeVisible();
      await expect(listings(page).first()).toHaveAttribute("data-hidden-listing", number ?? "");
    });
  });
}
