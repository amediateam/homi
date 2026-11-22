import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/** Launch links and the locale before and after sign-in (WP-21, TMA-009 … TMA-012). */

const route = (page: Page, name: string) => page.locator(`[data-route="${name}"]`).filter({ visible: true });
const back = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked"));
const ready = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-session", "ready");

test.describe("launch", () => {
  test("a plain launch is ready on the feed and the launch fragment is gone from the address", { annotation: [{ type: "screen", description: "SCR-007" }] }, async ({ page }) => {
    await launchApp(page);
    await ready(page);
    await expect(route(page, "feed")).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe("");
  });

  test("start_param l_42-web opens the listing over the feed; Back returns to the feed without the fragment", { annotation: [{ type: "screen", description: "SCR-018" }] }, async ({ page }) => {
    await launchApp(page, { startParam: "l_42-web" });
    await ready(page);
    await expect(page).toHaveURL(/\/ru\/listing\/42$/);
    await expect(page.locator('[data-route="listing"][data-layer="overlay"]').filter({ visible: true })).toBeVisible();

    await back(page);

    await expect(page).toHaveURL(/\/ru$/);
    await expect(route(page, "listing")).toHaveCount(0);
    await expect(route(page, "feed")).toBeVisible();
  });

  test("a listing link opens its listing once per launch: a reload inside the launch shows the feed, a new launch opens it again (WP-36)", async ({
    page,
  }) => {
    const app = await launchApp(page, { startParam: "l_42-web" });
    await ready(page);
    await expect(page).toHaveURL(/\/ru\/listing\/42$/);
    await back(page);
    await expect(page).toHaveURL(/\/ru$/);

    // The mark holds a digest of the launch and the number, no launch data in the clear (SEC-REQ-007).
    const hash = new URLSearchParams(app.initData).get("hash") ?? "";
    const mark = await page.evaluate(() => window.sessionStorage.getItem("homi-launch-done"));
    expect(mark).toMatch(/^[0-9a-z]+:42$/);
    expect(mark).not.toContain(hash);
    expect(await page.evaluate(() => window.localStorage.getItem("homi-launch-done"))).toBeNull();

    // A reload at the feed inside the same launch (a reload at the listing's own address shows it by its address).
    await page.reload();
    await ready(page);
    await expect(route(page, "feed")).toBeVisible();
    await expect(page).toHaveURL(/\/ru$/);
    await expect(route(page, "listing")).toHaveCount(0);

    // A new launch is a new webview with new launch data: it opens the listing again.
    const next = await page.context().newPage();
    const data = new URLSearchParams(app.initData);
    data.set("hash", "f".repeat(64));
    await launchApp(next, { initData: data.toString() });
    await ready(next);
    await expect(next).toHaveURL(/\/ru\/listing\/42$/);
    await next.close();
  });

  test("?listing=7 opens the listing, and Back lands on the feed without the parameter", async ({ page }) => {
    await launchApp(page, { path: "/?listing=7" });
    await ready(page);
    await expect(page).toHaveURL(/\/ru\/listing\/7$/);

    await back(page);
    await expect(page).toHaveURL(/\/ru$/);
  });

  test("?news=pets opens the filters address on the pets section", { annotation: [{ type: "screen", description: "SCR-014" }] }, async ({ page }) => {
    await launchApp(page, { path: "/?news=pets" });
    await ready(page);
    await expect(page).toHaveURL(/\/ru\/filters\?focus=pets$/);
    await expect(page.locator('[data-route="filters"][data-layer="sheet"]').filter({ visible: true })).toBeVisible();
  });

  test("an uz Telegram user lands on /uz before sign-in; after it me.locale of the stub user (ru) wins", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/bff/session", async (route) => {
      if (route.request().method() === "POST") {
        await held;
      }
      await route.fallback();
    });
    await launchApp(page, { locale: "uz" });

    await expect(page).toHaveURL(/\/uz$/);
    release();
    await ready(page);
    await expect(page).toHaveURL(/\/ru$/);
  });
});
