import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Telegram 6.0, the oldest client the app starts on (WP-33 `coverage/version-gates.spec.ts`, `@gates`; TMA-042). The
 * tests name the version themselves, so they hold in every project; the manual run's `miniapp-old` gives every other
 * launch 6.0 as well. The fake throws on a member above its version, so a call that slips through fails the screen.
 */
const OLD = "6.0";

/** The members of Telegram above 6.0 that the app reads (the fake's version table, `@homi/testing` fakeTelegram.ts). */
const ABOVE_OLD = /^(SettingsButton|setHeaderColor|setBackgroundColor|showConfirm|showAlert|requestWriteAccess|requestContact|disableVerticalSwipes|enableVerticalSwipes|requestFullscreen|exitFullscreen|shareMessage|checkHomeScreenStatus|addToHomeScreen|LocationManager|DeviceStorage)\b/;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });

test.describe("Telegram 6.0 @gates", { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-043" }] }, () => {
  test("the app starts; the feed, a listing and settings call nothing above 6.0", async ({ page }) => {
    await stubMedia(page);
    const app = await launchApp(page, { version: OLD });
    await expect(visible(page, "[data-card]").first()).toBeVisible();
    await visible(page, "[data-card]").first().click();
    await expect(visible(page, '[data-route="listing"]')).toBeVisible();
    await page.goto("/ru/settings");
    await expect(visible(page, '[data-route="settings"]')).toBeVisible();
    // The home-screen offer asks `checkHomeScreenStatus` first: none at 6.0, so it never shows.
    await page.waitForTimeout(500);

    const above = (await app.calls()).map((call) => call.member).filter((member) => ABOVE_OLD.test(member));
    expect(above).toEqual([]);
  });

  // Sharing at 6.0 falls back to the share link (TMA-031): the e2e build has no bot name, so the listing shows no share
  // button; the fallback is the unit tests' of `useShareListing` and `lib/telegram/share.ts`.
  test("a confirm falls back to the browser's dialog", async ({ page }) => {
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
