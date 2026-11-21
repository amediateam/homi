import { expect, launchApp, syntheticInitData, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/** The session exchange of WP-21 (`25` §3.4) against the API on stubs. */

const session = (page: Page) => page.locator("html");
const isSessionPost = (url: string, method: string) => url.endsWith("/bff/session") && method === "POST";

test.describe("session", () => {
  test("cookie mode: one homi_session cookie with its attributes, and the token nowhere else", async ({ page }) => {
    const signIn = page.waitForResponse((response) => isSessionPost(response.url(), response.request().method()));
    await launchApp(page);
    const response = await signIn;

    await expect(session(page)).toHaveAttribute("data-session", "ready");
    const { token } = (await response.json()) as { token: string };
    const cookie = (await response.headersArray()).filter((header) => header.name.toLowerCase() === "set-cookie").map((header) => header.value).find((value) => value.startsWith("homi_session="));
    expect(cookie).toBeDefined();
    for (const attribute of ["httponly", "secure", "samesite=none", "partitioned", "path=/", "expires="]) {
      expect(cookie?.toLowerCase(), attribute).toContain(attribute);
    }
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href, cookie: document.cookie }));
    expect(stored).not.toContain(token);
  });

  test("cookie mode: a second launch with the cookie of the same user signs in no more", async ({ page, context }) => {
    await launchApp(page);
    await expect(session(page)).toHaveAttribute("data-session", "ready");

    const second = await context.newPage();
    const posts: string[] = [];
    second.on("request", (request) => isSessionPost(request.url(), request.method()) && posts.push(request.url()));
    await launchApp(second);
    await expect(session(second)).toHaveAttribute("data-session", "ready");
    expect(posts).toEqual([]);
  });

  test("another Telegram user on the same device gets a new session", async ({ page, context }) => {
    await launchApp(page);
    await expect(session(page)).toHaveAttribute("data-session", "ready");

    const second = await context.newPage();
    const signIn = second.waitForRequest((request) => isSessionPost(request.url(), request.method()));
    await launchApp(second, { initData: syntheticInitData({ id: 100_000_002 }) });
    await signIn;
    await expect(session(second)).toHaveAttribute("data-session", "ready");
  });

  test("header mode: the cookie refused, requests carry the bearer header", async ({ page }) => {
    const bearer = page.waitForRequest((request) => request.url().endsWith("/bff/session") && (request.headers().authorization ?? "").startsWith("Bearer "));
    await launchApp(page, { mode: "header" });

    await bearer;
    await expect(session(page)).toHaveAttribute("data-session", "ready");
    expect((await page.context().cookies()).map((cookie) => cookie.name)).not.toContain("homi_session");
  });

  test("a refused cookie check followed by a successful sign-in is invisible", async ({ page }) => {
    let refused = false;
    await page.route("**/bff/session", async (route) => {
      if (route.request().method() === "GET" && !refused) {
        refused = true;
        await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "unauthenticated" }) });
        return;
      }
      await route.fallback();
    });
    await launchApp(page);

    await expect(session(page)).toHaveAttribute("data-session", "ready");
    expect(refused).toBe(true);
  });

  test("a refused sign-in shows the expired state", async ({ page }) => {
    await page.route("**/bff/session", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "auth_expired" }) });
        return;
      }
      await route.fallback();
    });
    await launchApp(page);

    await expect(session(page)).toHaveAttribute("data-session", "expired");
  });

  test("without the SDK the app tells Telegram it is ready through the native bridge (TMA-005)", async ({ page }) => {
    const app = await launchApp(page, { sdk: false });

    await expect(session(page)).toHaveAttribute("data-session", "ready");
    expect(await app.bridgeEvents()).toEqual(expect.arrayContaining(["web_app_ready", "web_app_expand"]));
  });
});
