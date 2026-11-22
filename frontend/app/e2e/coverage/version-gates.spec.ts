import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Telegram 6.0, the oldest client the app starts on (WP-33 `coverage/version-gates.spec.ts`, `@gates`; TMA-042). The
 * tests name the version themselves, so they hold in every project that runs `@gates`; the manual run's `miniapp-old`
 * gives every other launch 6.0 as well. The fake records a member above its version and throws, and the app's
 * `attempt()` (`lib/telegram/sdk.ts`) swallows the throw: the fake's record is the only evidence of a call that slipped
 * through, and it lives in one document.
 */
const OLD = "6.0";

/** The first data of a layer the app opens. */
const API_MS = 20_000;

/** The members of Telegram above 6.0 that the app reads (the fake's version table, `@homi/testing` fakeTelegram.ts). */
const ABOVE_OLD = /^(SettingsButton|setHeaderColor|setBackgroundColor|showConfirm|showAlert|requestWriteAccess|requestContact|disableVerticalSwipes|enableVerticalSwipes|requestFullscreen|exitFullscreen|shareMessage|checkHomeScreenStatus|addToHomeScreen|LocationManager|DeviceStorage)\b/;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const pressBack = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked"));

test.describe("Telegram 6.0 @gates", () => {
  test("the app starts; the feed, a listing and settings call nothing above 6.0", { annotation: [{ type: "screen", description: "SCR-006" }] }, async ({ page }) => {
    await stubMedia(page);
    const app = await launchApp(page, { version: OLD });
    // The test stays in the document it launched, so the record holds the feed's, the listing's and settings' calls:
    // settings is reached the app's way (Back, then the tab bar; 6.0 has no SettingsButton), never by a load.
    let loads = 0;
    page.on("load", () => {
      loads += 1;
    });
    await expect(visible(page, "[data-card]").first()).toBeVisible();
    await visible(page, "[data-card]").first().click();
    await expect(visible(page, '[data-route="listing"] [data-listing-state="loaded"]')).toBeVisible({ timeout: API_MS });
    await pressBack(page);
    await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
    await visible(page, '[data-tabbar] [data-tab="settings"]').click();
    // The settings screen itself, not its server fallback (a spinner under the same route): its rows have mounted.
    await expect(visible(page, '[data-route="settings"] [data-settings-row="theme"]')).toBeVisible({ timeout: API_MS });
    // The home-screen offer asks `checkHomeScreenStatus` first: none at 6.0, so it never shows.
    await page.waitForTimeout(500);

    const members = (await app.calls()).map((call) => call.member);
    expect(loads, "one document from the launch to settings").toBe(0);
    // Only the listing over the feed shows Back: the record still holds the listing's calls.
    expect(members).toContain("BackButton.show");
    expect(members.filter((member) => ABOVE_OLD.test(member))).toEqual([]);
  });

  // Sharing at 6.0 falls back to the share link (TMA-031): the e2e build has no bot name, so the listing shows no share
  // button; the fallback is the unit tests' of `useShareListing` and `lib/telegram/share.ts`.
  test("a confirm falls back to the browser's dialog", { annotation: [{ type: "screen", description: "SCR-043" }] }, async ({ page }) => {
    await stubMedia(page);
    const app = await launchApp(page, { version: OLD, path: "/saved/history" });
    const asked: string[] = [];
    page.on("dialog", (dialog) => {
      asked.push(dialog.type());
      void dialog.dismiss();
    });
    await visible(page, "[data-clear-history]").click();
    await expect.poll(() => asked).toEqual(["confirm"]);
    expect((await app.calls()).map((call) => call.member).filter((member) => ABOVE_OLD.test(member))).toEqual([]);
  });
});
