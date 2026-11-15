import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/** Telegram's BackButton and SettingsButton over the placeholder routes (WP-21, `25` §3.2, `03` §1.2). */

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

const fake = (page: Page) => page.evaluateHandle(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram);
const backVisible = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
const press = async (page: Page, eventType: "backButtonClicked" | "settingsButtonClicked") => (await fake(page)).evaluate((telegram, type) => telegram.emit(type), eventType);
const route = (page: Page, name: string) => page.locator(`[data-route="${name}"]`).filter({ visible: true });
const link = (page: Page, href: string) => page.locator(`[data-link="${href}"]`).filter({ visible: true }).first();

async function ready(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
}

test.describe("Back and Settings", () => {
  for (const path of ["/", "/map", "/saved", "/saved/history", "/radars", "/settings"]) {
    test(`BackButton is hidden on the root tab ${path}`, async ({ page }) => {
      await launchApp(page, { path });
      await ready(page);
      await expect.poll(() => backVisible(page)).toBe(false);
    });
  }

  test("a sheet opened in the app: Back closes it", async ({ page }) => {
    await launchApp(page);
    await ready(page);
    await link(page, "/filters").click();
    await expect(page.locator('[data-route="filters"][data-layer="sheet"]').filter({ visible: true })).toBeVisible();
    await expect.poll(() => backVisible(page)).toBe(true);

    await press(page, "backButtonClicked");

    await expect(page).toHaveURL(/\/ru$/);
    await expect(page.locator('[data-route="filters"]').filter({ visible: true })).toHaveCount(0);
    await expect.poll(() => backVisible(page)).toBe(false);
  });

  test("listing → photos → Back → Back returns to the feed", async ({ page }) => {
    await launchApp(page);
    await ready(page);
    await link(page, "/listing/42").click();
    await expect(route(page, "listing")).toBeVisible();
    await link(page, "/listing/42/photos").click();
    await expect(route(page, "listing/photos")).toBeVisible();

    await press(page, "backButtonClicked");
    await expect(page).toHaveURL(/\/ru\/listing\/42$/);
    await expect(route(page, "listing/photos")).toHaveCount(0);
    await expect(route(page, "listing")).toBeVisible();

    await press(page, "backButtonClicked");
    await expect(page).toHaveURL(/\/ru$/);
    await expect(route(page, "listing")).toHaveCount(0);
    await expect(route(page, "feed")).toBeVisible();
  });

  test("a sheet address loaded directly: Back goes to its parent with the search state", async ({ page }) => {
    await launchApp(page, { path: "/filters?from=map&rooms_min=2" });
    await ready(page);
    await expect.poll(() => backVisible(page)).toBe(true);

    await press(page, "backButtonClicked");

    await expect(page).toHaveURL(/\/ru\/map\?rooms_min=2$/);
    await expect(route(page, "map")).toBeVisible();
    await expect.poll(() => backVisible(page)).toBe(false);
  });

  test("SettingsButton from an open sheet shows settings with no layer over it (fix of LB-APP-046)", async ({ page }) => {
    await launchApp(page);
    await ready(page);
    await link(page, "/filters").click();
    await expect(page.locator('[data-route="filters"][data-layer="sheet"]').filter({ visible: true })).toBeVisible();

    await press(page, "settingsButtonClicked");

    await expect(route(page, "settings")).toBeVisible();
    await expect(page.locator("[data-layer]").filter({ visible: true })).toHaveCount(0);
  });

  test("Telegram 6.0 gets no SettingsButton", async ({ page }) => {
    const app = await launchApp(page, { version: "6.0" });
    await ready(page);
    expect((await app.calls()).filter((call) => call.member.startsWith("SettingsButton"))).toEqual([]);
  });
});
