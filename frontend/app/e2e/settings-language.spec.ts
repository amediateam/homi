import { expect, launchApp, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * Language and currency of the settings (WP-31, SCR-035, SCR-036; the fix of LB-APP-041): a language pick changes the
 * address segment and the texts in place — a marker set on `window` before the switch is still there, so the document
 * did not load again — and Back from the language page lands under the new segment. A currency pick makes the
 * amounts the client formats (the price presets of the quick filter) read in сум and the server parts be asked again.
 * The stub's server-formatted card prices do not follow the setting; that half is checked on real sources (WP-48).
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
const row = (page: Page, id: string) => visible(page, `[data-route="settings"] [data-settings-row="${id}"]`);
const tab = (page: Page, key: string) => visible(page, `[data-tab="${key}"]`);
const radio = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const address = (page: Page) => new URL(page.url()).pathname;

async function open(page: Page, mode: "cookie" | "header", path = "/settings"): Promise<void> {
  await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
  await expect(row(page, "language")).toBeVisible({ timeout: API_MS });
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`settings: language and currency (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-035" }, { type: "screen", description: "SCR-036" }] }, () => {
    test("ru → en changes the segment and the texts in place; Back lands under the new segment", async ({ page }) => {
      const sessions: Request[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.endsWith("/bff/session")) {
          sessions.push(request);
        }
      });
      await open(page, mode);
      await page.evaluate(() => {
        (window as unknown as { __marker: number }).__marker = 42;
      });
      const before = sessions.length;

      await row(page, "language").click();
      await expect(page.getByRole("region", { name: "Язык" })).toBeVisible();
      await radio(page, "English").click();

      await expect.poll(() => address(page)).toBe("/en/settings/language");
      await expect(html(page)).toHaveAttribute("lang", "en");
      await expect(page.getByRole("region", { name: "Language" })).toBeVisible();
      await expect(radio(page, "English")).toHaveAttribute("aria-checked", "true");
      await expect(tab(page, "settings")).toContainText("Settings");
      expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
      expect(sessions.length).toBe(before);

      await press(page, "backButtonClicked");
      await expect.poll(() => address(page)).toBe("/en/settings");
      await expect(row(page, "language").locator("[data-settings-value]")).toHaveText("English");
      expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
    });

    test("USD → UZS: the price presets read in сум and the server parts are asked again", async ({ page }) => {
      await open(page, mode);
      const reads: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname.startsWith("/bff/") || request.headers()["rsc"] === "1") {
          reads.push(url.pathname);
        }
      });

      await row(page, "currency").click();
      await expect(page.getByRole("region", { name: "Валюта" })).toBeVisible();
      await radio(page, "Сумы").click();
      await expect(radio(page, "Сумы")).toHaveAttribute("aria-checked", "true", { timeout: API_MS });
      await expect.poll(() => reads.length).toBeGreaterThan(0);
      await press(page, "backButtonClicked");
      await expect(row(page, "currency").locator("[data-settings-value]")).toHaveText("Сумы");

      await tab(page, "search").click();
      await visible(page, '[data-topbar="search-list"] [data-chip="price"]').click();
      const preset = visible(page, '[data-slot="bottom-sheet"] [data-slot="price-presets"] [data-preset]').first();
      await expect(preset).toBeVisible();
      await expect(preset).toContainText(/сум/);
    });
  });
}
