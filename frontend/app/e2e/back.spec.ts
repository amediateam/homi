import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/** Telegram's BackButton and SettingsButton over the feed and the placeholder routes (WP-21, `25` §3.2, `03` §1.2). */

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

const fake = (page: Page) => page.evaluateHandle(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram);
const backVisible = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
const press = async (page: Page, eventType: "backButtonClicked" | "settingsButtonClicked") => (await fake(page)).evaluate((telegram, type) => telegram.emit(type), eventType);
const route = (page: Page, name: string) => page.locator(`[data-route="${name}"]`).filter({ visible: true });
/** The first photo of the open listing's hero (WP-26): a tap opens the viewer at it. */
const heroPhoto = (page: Page) => page.locator('[data-hero] [data-slide="0"]').filter({ visible: true }).first();
/** The filters chip of the feed's top bar (WP-24). */
const filtersChip = (page: Page) => page.locator('[data-topbar="search-list"] [data-chip="filters"]').filter({ visible: true });

/** Opens the feed's first card (WP-24) and gives its number: the stub catalogue decides which one it is. */
async function openFirstCard(page: Page): Promise<number> {
  const card = page.locator("article[data-listing]").filter({ visible: true }).first();
  const number = Number(await card.getAttribute("data-listing"));
  await card.locator("a").click();
  return number;
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
}

test.describe("Back and Settings", { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
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
    await filtersChip(page).click();
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
    const number = await openFirstCard(page);
    await expect(route(page, "listing")).toBeVisible();
    await heroPhoto(page).click();
    await expect(route(page, "listing/photos")).toBeVisible();

    await press(page, "backButtonClicked");
    await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
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
    await filtersChip(page).click();
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
