import { expect, playwrightTelegram, test } from "@homi/testing/playwright";

/** First end-to-end test (WP-03): the runner, the fake Telegram and the external-request guard work. */
test.describe("Mini App smoke", () => {
  test("renders / inside the fake Telegram without a console error", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await playwrightTelegram(page, { version: "8.0", platform: "ios" });

    await page.goto("/");

    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => (window as { Telegram?: { WebApp: { version: string } } }).Telegram?.WebApp.version)).toBe(
      "8.0",
    );
    expect(errors).toEqual([]);
  });

  test("fails when the page sends a request to telegram.org", async ({ page }) => {
    test.fail(true, "the external-request guard must fail this test");
    await playwrightTelegram(page);
    await page.goto("/");

    await page.evaluate(() => fetch("https://telegram.org/js/telegram-web-app.js").catch(() => undefined));
  });
});
