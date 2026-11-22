import { expect, launchApp, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The home-screen offer (WP-31, BR-APP-045, SCR-041) on Telegram 8.0: with three visit days stored and the status
 * `missed`, the card shows after 4 s of a calm feed and `homi-home` holds `offered: true`; with the status `unknown`
 * no card and `offered` stays false; Telegram's "added" event shows the toast and the settings row goes. The
 * `home_screen_offered` event itself is asserted in `homeScreen` unit tests: the analytics facade sends nothing before
 * WP-32.
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
/** The card's title, not the nudge host's live line, which repeats it for screen readers. */
const card = (page: Page) => page.locator("b", { hasText: "HOMI на экране телефона" });
const memory = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem("homi-home") ?? "null") as { days: string[]; offered: boolean } | null);

/** Three earlier visit days and the follow and return nudges silenced, so the home slot is the only one. */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded") !== null) {
      return;
    }
    sessionStorage.setItem("seeded", "1");
    const far = Date.now() + 30 * 24 * 3_600_000;
    try {
      localStorage.setItem("homi-home", JSON.stringify({ days: ["2026-01-01", "2026-01-02", "2026-01-03"], offered: false }));
      localStorage.setItem("homi-nudge", JSON.stringify({ asked: [], closed: 0, quietUntil: far, lastShown: 0, back: {}, feedOff: far }));
    } catch {
      // No storage on this document (about:blank).
    }
  });
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`home-screen offer (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-041" }] }, () => {
    test("status missed: the card after 4 s of calm, offered: true", async ({ page }) => {
      await seed(page);
      await launchApp(page, { mode, version: "8.0", answers: { homeScreenStatus: "missed" } });
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });

      await expect(card(page)).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => (await memory(page))?.offered).toBe(true);
      expect((await memory(page))?.days.length).toBeGreaterThanOrEqual(3);
    });

    test("status unknown: no card, offered stays false", async ({ page }) => {
      await seed(page);
      await launchApp(page, { mode, version: "8.0", answers: { homeScreenStatus: "unknown" } });
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });

      await page.waitForTimeout(7_000);
      await expect(card(page)).toHaveCount(0);
      expect((await memory(page))?.offered).toBe(false);
    });

    test("the added event: the toast, and the settings row goes", async ({ page }) => {
      await seed(page);
      await launchApp(page, { mode, version: "8.0", path: "/settings", answers: { homeScreenStatus: "missed" } });
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      const homeRow = visible(page, '[data-settings-row="home"]');
      await expect(homeRow).toBeVisible({ timeout: API_MS });

      await page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit("homeScreenAdded"));
      await expect(visible(page, '[data-toast-host="app"] [data-toast]')).toHaveText("Значок HOMI добавлен на экран телефона");
      await expect(homeRow).toHaveCount(0);
    });
  });
}
