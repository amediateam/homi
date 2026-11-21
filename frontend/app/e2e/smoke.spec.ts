import { expect, playwrightTelegram, stubMedia, test } from "@homi/testing/playwright";

/** First end-to-end test (WP-03): the runner, the fake Telegram and the external-request guard work. */
test.describe("Mini App smoke @smoke", () => {
  test("renders / inside the fake Telegram without a console error", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    // The feed's card photos come from the stub CDN, which CI cannot resolve: a photo that fails to load logs an error.
    await stubMedia(page);
    await playwrightTelegram(page, { version: "8.0", platform: "ios" });

    await page.goto("/");

    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator('[data-route="feed"]')).toBeVisible();
    expect(await page.evaluate(() => (window as { Telegram?: { WebApp: { version: string } } }).Telegram?.WebApp.version)).toBe(
      "8.0",
    );
    expect(errors).toEqual([]);
  });

  test("fails when the page sends a request to telegram.org", async ({ page }) => {
    test.fail(true, "the external-request guard must fail this test");
    await playwrightTelegram(page);
    await page.goto("/");

    // The CSP of WP-21 stops a fetch before it leaves the page; a navigation is not subject to it.
    await page.evaluate(() => location.assign("https://telegram.org/js/telegram-web-app.js")).catch(() => undefined);
    await page.waitForTimeout(300);
  });
});
