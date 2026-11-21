import { gunzipSync } from "node:zlib";

import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * PostHog of WP-32 (`03` §3.3, §1.7, §1.9; SEC-021, SEC-REQ-036) in the `@analytics` run only (`E2E_ANALYTICS=1`,
 * `frontend/playwright.config.ts`): the app is built with a fake key and the unroutable host below, which these specs
 * answer themselves, so nothing leaves the machine. They check when PostHog loads, the pageviews of a journey, that no
 * payload carries launch data, a token, the session cookie, a query or a hash, and that Save-Data loads nothing.
 */

const HOST = "posthog.e2e.invalid";
/** A name only the recorder's bundle (`posthog-js/dist/posthog-recorder`) holds: rrweb's `record.takeFullSnapshot`. */
const RECORDER_MARK = "takeFullSnapshot";

type Captured = { event: string; properties: Record<string, unknown> };

/** A body as PostHog sends it: gzip, `data=<base64>` or plain JSON. */
function decode(buffer: Buffer, compression: string | null): string {
  try {
    if (compression === "gzip-js" || (buffer[0] === 0x1f && buffer[1] === 0x8b)) {
      return gunzipSync(buffer).toString("utf8");
    }
    const text = buffer.toString("utf8");
    if (text.startsWith("data=")) {
      return Buffer.from(decodeURIComponent(text.slice(5)), "base64").toString("utf8");
    }
    return compression === "base64" ? Buffer.from(text, "base64").toString("utf8") : text;
  } catch {
    return buffer.toString("utf8");
  }
}

/** Answers every request to the PostHog host and decodes what it sends (gzip or plain JSON, one event or a batch). */
async function posthog(page: Page): Promise<{ requests: Request[]; events: () => Captured[]; texts: () => string[] }> {
  const requests: Request[] = [];
  const bodies: string[] = [];
  await page.route(
    (url) => url.hostname === HOST,
    async (route) => {
      const request = route.request();
      requests.push(request);
      const buffer = request.postDataBuffer();
      if (buffer !== null && buffer.length > 0) {
        bodies.push(decode(buffer, new URL(request.url()).searchParams.get("compression")));
      }
      // The project's remote config and flags: recording allowed (whether a launch records is the app's sampling).
      const path = new URL(request.url()).pathname;
      const body = /\/config$|\/flags\/?$/.test(path) ? JSON.stringify({ flags: {}, sessionRecording: { endpoint: "/s/" }, supportedCompression: ["gzip-js"] }) : "{}";
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body });
    },
  );
  const events = () =>
    bodies.flatMap((body) => {
      try {
        const parsed = JSON.parse(body) as unknown;
        const list = Array.isArray(parsed) ? parsed : ((parsed as { batch?: unknown[] }).batch ?? [parsed]);
        // The flags request is not an event: only objects with an event name and properties count.
        return (list as Captured[]).filter((item) => typeof item?.event === "string" && typeof item.properties === "object" && item.properties !== null);
      } catch {
        return [];
      }
    });
  return { requests, events, texts: () => [...bodies] };
}

const screens = (events: Captured[]) => events.filter((event) => event.event === "$pageview").map((event) => String(event.properties.screen));

test.describe("analytics @analytics", () => {
  // PostHog sends nothing for a user agent it takes for a bot (headless Chrome's): the phone's own, as in Telegram.
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Telegram-Android/11.5.0" });
  test.beforeEach(async ({ page }) => {
    // …and for an automated browser (`navigator.webdriver`), which Playwright's is.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      // Headless Chrome also names itself in the client hints.
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined, configurable: true });
      // Full graphics whatever the runner's cores: lite mode never samples a replay (and would mark an Android phone).
      try {
        window.localStorage.setItem("homi-graphics", "full");
      } catch {
        // No storage: the rule decides.
      }
    });
  });

  test("PostHog loads after the first photo; a journey sends its pageviews; no payload carries launch data, a token, a query or a hash", async ({ page }) => {
    await stubMedia(page);
    const ph = await posthog(page);
    await launchApp(page, { path: "/" });
    await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
    await expect(page.locator("article[data-listing]").first()).toBeVisible();
    await expect.poll(() => screens(ph.events()), { timeout: 15_000 }).toContain("search/list");

    await page.locator('[data-topbar="search-list"] [data-chip="rooms"]').filter({ visible: true }).click();
    await expect.poll(() => screens(ph.events())).toContain("filters/rooms");
    await page.evaluate(() => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked"));
    await page.locator("article[data-listing] a").filter({ visible: true }).first().click();
    await expect.poll(() => screens(ph.events())).toContain("listing");

    const pageviews = ph.events().filter((event) => event.event === "$pageview");
    expect(screens(pageviews).slice(0, 3)).toEqual(["search/list", "filters/rooms", "search/list"]);
    const listing = pageviews.find((event) => event.properties.screen === "listing")!;
    expect(typeof listing.properties.listing_id).toBe("number");
    for (const event of ph.events()) {
      expect(String(event.properties.$current_url ?? "")).not.toMatch(/[?#]/);
      expect(event.properties.session_mode).toBe("cookie");
    }
    for (const text of ph.texts()) {
      expect(text).not.toMatch(/tgWebAppData|Bearer |homi_session=/);
    }
  });

  test("with Save-Data nothing is asked of PostHog at all", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" }, configurable: true });
    });
    await stubMedia(page);
    const ph = await posthog(page);
    await launchApp(page, { path: "/" });
    await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
    await expect(page.locator("article[data-listing]").first()).toBeVisible();
    // Past the 8 s fallback and its 500 ms.
    await page.waitForTimeout(9_000);

    expect(ph.requests).toEqual([]);
  });

  test("a profile sampled for replay loads the recorder's code; the journey's profile (replay off) does not", async ({ page }) => {
    let recorder = false;
    page.on("response", async (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js")) {
        // Await the body first and only ever set the flag: a later chunk's body must not write `false` over it.
        const body = await response.text().catch(() => "");
        if (body.includes(RECORDER_MARK)) {
          recorder = true;
        }
      }
    });
    // The stub profile sampled for replay (`me/replay.json`): the sign-in, the server's render after it and every `/me`
    // read give the same profile, so the launch's one decision cannot see the unsampled default.
    await page.context().addCookies([{ name: "homi_stub_scenario", value: "replay", url: test.info().project.use.baseURL }]);
    await stubMedia(page);
    const ph = await posthog(page);
    await launchApp(page, { path: "/" });
    await expect(page.locator("article[data-listing]").first()).toBeVisible();
    await expect.poll(() => ph.requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // The recorder loads only outside lite mode: a failure below then names its cause.
    expect(await page.evaluate(() => document.documentElement.classList.contains("lite"))).toBe(false);

    await expect.poll(() => recorder, { timeout: 10_000 }).toBe(true);
  });

  test("replay off in the profile (the stub default): no recorder code", async ({ page }) => {
    let recorder = false;
    page.on("response", async (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js")) {
        // Await the body first and only ever set the flag: a later chunk's body must not write `false` over it.
        const body = await response.text().catch(() => "");
        if (body.includes(RECORDER_MARK)) {
          recorder = true;
        }
      }
    });
    await stubMedia(page);
    const ph = await posthog(page);
    await launchApp(page, { path: "/" });
    await expect(page.locator("article[data-listing]").first()).toBeVisible();
    await expect.poll(() => ph.requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForLoadState("networkidle");

    expect(recorder).toBe(false);
  });
});
