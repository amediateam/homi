import { allowConsoleErrors, expect, playwrightTelegram, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/** The update screen of the boot script (SCR-001, TMA-003, WP-21). */

interface Boot {
  ok: boolean;
  sdk: string | null;
}

const updateScreen = (page: Page) => page.locator("[data-boot-screen]");
const boot = (page: Page) => page.evaluate(() => (window as unknown as { __homiBoot?: Boot }).__homiBoot ?? null);

test.describe("boot failure", () => {
  test("the boot script and the stubs run before the SDK tag", async ({ page }) => {
    await playwrightTelegram(page);
    await page.goto("/ru");

    const order = await page.evaluate(() => [...document.querySelectorAll("script")].map((script) => script.id).filter(Boolean));
    expect(order.indexOf("homi-boot")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("homi-boot")).toBeLessThan(order.indexOf("tg-sdk"));
    expect(await page.evaluate(() => typeof (window as unknown as { __tg__postBackgroundChange?: unknown }).__tg__postBackgroundChange)).toBe("function");
    await expect.poll(async () => (await boot(page))?.ok).toBe(true);
    await expect(updateScreen(page)).toHaveCount(0);
  });

  test("an engine below the floor sees «Telegramni yangilang» with both buttons working", async ({ page }) => {
    const telegram = await playwrightTelegram(page);
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((...args: [string, string?]) => (String(args[1]).startsWith("color-mix(") ? false : supports(...(args as [string, string])))) as typeof CSS.supports;
    });
    await page.goto("/uz");

    await expect(updateScreen(page)).toBeVisible();
    await expect(updateScreen(page).locator("h1")).toHaveText("Telegramni yangilang");
    await expect(page.locator("[data-boot-action=bot]")).toHaveText("Botga qaytish");

    await page.locator("[data-boot-action=bot]").click();
    expect((await telegram.calls()).map((call) => call.member)).toContain("close");

    const reloaded = page.waitForEvent("framenavigated");
    await page.locator("[data-boot-action=retry]").click();
    await reloaded;
    await expect(updateScreen(page)).toBeVisible();
  });

  test("a blocked app chunk shows the update screen in the launch language", async ({ page }) => {
    await playwrightTelegram(page);
    await page.route("**/_next/static/chunks/**", (route) => route.abort());
    await page.goto("/en");

    await expect(updateScreen(page)).toBeVisible();
    await expect(updateScreen(page).locator("h1")).toHaveText("Update Telegram");
  });

  test("an error before React mounts shows the screen, and it stays after the app mounts", async ({ page }) => {
    allowConsoleErrors(test.info(), /^uncaught: early crash$/);
    await playwrightTelegram(page);
    // Hold the app's chunks so that React cannot mount before the error.
    await page.route("**/_next/static/chunks/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () =>
        setTimeout(() => {
          throw new Error("early crash");
        }, 0),
      );
    });
    await page.goto("/ru", { waitUntil: "domcontentloaded" });

    await expect(updateScreen(page)).toBeVisible();
    await expect.poll(async () => (await boot(page))?.ok, { timeout: 10_000 }).toBe(true);
    await expect(updateScreen(page)).toBeVisible();
  });

  test("a blocked telegram.org shows no screen: the app starts without the SDK", async ({ page }) => {
    await page.route("https://telegram.org/**", (route) => route.abort("blockedbyclient"));
    await page.goto("/ru");

    await expect.poll(async () => (await boot(page))?.sdk).toBe("error");
    await expect.poll(async () => (await boot(page))?.ok, { timeout: 3_500 }).toBe(true);
    await expect(updateScreen(page)).toHaveCount(0);
  });

  test("a hanging telegram.org shows no screen either", async ({ page }) => {
    await page.route("https://telegram.org/**", () => undefined);
    await page.goto("/ru", { waitUntil: "domcontentloaded" });

    await expect.poll(async () => (await boot(page))?.ok, { timeout: 3_500 }).toBe(true);
    await expect(updateScreen(page)).toHaveCount(0);
  });
});
