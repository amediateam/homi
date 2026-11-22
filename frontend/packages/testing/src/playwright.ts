import { test as base, expect, type BrowserContext, type Locator, type Page, type Request as SentRequest } from "@playwright/test";

import { installFakeTelegram, resolveFakeTelegramConfig, type FakeTelegramCall, type FakeTelegramOptions, type FakeTelegramWindow } from "./fakeTelegram";
import { syntheticInitData } from "./initData";
import { modeFindings, projectProfile, projectSessionMode, resetModeRecords, trackExchange, watchMode, type SessionMode } from "./modes";

/**
 * Playwright side of `@homi/testing` (WP-03). Specs import `test` and `expect` from here: every test then runs behind
 * a guard that stops each request to a host other than the app under test and fails the test when one was stopped
 * (`telegram.org`, PostHog, any tile host — DEC-33). Two exceptions are answered here, so nothing leaves the
 * machine: the SDK tag of the Mini App's layout (WP-21) gets an empty script, so the fake stays the SDK; and a tile of
 * the OpenStreetMap raster fallback (WP-27) gets a blank PNG, because the map shows that basemap while `tiles` is
 * `null` and any spec that opens the map would otherwise fail. Any other request to telegram.org — a `fetch` of the
 * same address included — or to another OpenStreetMap address still fails the test; a spec may answer tiles itself
 * with `page.route`, which runs first.
 */

/** The `<script id="tg-sdk">` of `frontend/app/app/[locale]/layout.tsx` (TMA-001). */
export const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

/** A tile of the raster fallback, `OSM_TILE_URL` of `frontend/app/features/map/tiles.ts`. */
const OSM_TILE = /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/;

/** A transparent 1×1 PNG: the guard's answer to an OpenStreetMap tile, and a fixture for specs that answer tiles. */
export const BLANK_TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  "base64",
);

export interface PlaywrightTelegramOptions extends FakeTelegramOptions {
  /**
   * Hosts a spec answers itself with `page.route` from a fixture (tiles, media — WP-27). Their requests that the
   * spec does not fulfil are aborted without failing the test; none of them ever leaves the machine.
   */
  allowHosts?: string[];
  /** The session mode; default: the project's (WP-33). */
  mode?: SessionMode;
}

export interface PlaywrightTelegram {
  /** URLs the guard stopped so far. */
  readonly blockedRequests: readonly string[];
  /** The calls the page made on the fake Telegram; functions in arguments become `"[function]"`. */
  calls(): Promise<FakeTelegramCall[]>;
}

interface GuardState {
  blocked: string[];
  allowHosts: Set<string>;
}

const guards = new WeakMap<BrowserContext, GuardState>();

/** Hosts of the machine itself: the app under test, the local `*.homi.loc` stack. */
function isLocal(hostname: string, baseHost: string | undefined): boolean {
  return (
    hostname === baseHost ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "homi.loc" ||
    hostname.endsWith(".homi.loc")
  );
}

async function guard(page: Page): Promise<GuardState> {
  const context = page.context();
  const existing = guards.get(context);
  if (existing) {
    return existing;
  }
  const state: GuardState = { blocked: [], allowHosts: new Set() };
  guards.set(context, state);
  const baseURL = test.info().project.use.baseURL;
  const baseHost = baseURL ? new URL(baseURL).hostname : undefined;
  // A context route runs after every page route and after routes the spec registers later, so a spec's own
  // `page.route` answers first; whatever reaches this handler is the last word on the request.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (isLocal(url.hostname, baseHost)) {
      await route.fallback();
      return;
    }
    if (url.href === TELEGRAM_SDK_URL && route.request().resourceType() === "script") {
      // The tag is `crossorigin="anonymous"`, so the answer needs the CORS header telegram.org sends.
      await route.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: "" });
      return;
    }
    if (OSM_TILE.test(url.href)) {
      await route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: BLANK_TILE_PNG });
      return;
    }
    if (!state.allowHosts.has(url.hostname)) {
      state.blocked.push(url.href);
    }
    await route.abort("blockedbyclient");
  });
  return state;
}

/**
 * The project's Telegram profile (`metadata.profile` of `frontend/playwright.config.ts`, WP-33) under the options of
 * the spec: a spec that names a platform, version or scheme keeps it.
 */
function withProfile<T extends FakeTelegramOptions>(options: T): T {
  const { platform, version, colorScheme } = projectProfile(test.info());
  return { ...(platform && { platform }), ...(version && { version }), ...(colorScheme && { colorScheme }), ...options };
}

/**
 * The session mode of a launch (WP-33): the checks of `./modes` after the test, and in header mode the strip of
 * `Set-Cookie` from the app's `/bff/session` answers. Every launch goes through here — `launchApp`, and a spec that
 * installs the fake with `playwrightTelegram` and loads the page itself — so no spec opts out of its project's mode.
 */
/** Request headers Node's `fetch` sets itself or that describe a body it re-encodes. */
const OWN_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "accept-encoding", "cookie"]);
/** Answer headers that no longer hold for the decoded body, and the refused cookie. */
const DROPPED_ANSWER_HEADERS = new Set(["set-cookie", "content-encoding", "content-length", "transfer-encoding"]);

/**
 * One exchange of header mode (WP-33), sent with Node's own `fetch`: it keeps no cookies, so the answer's `Set-Cookie`
 * reaches neither the browser nor a later exchange, as in a frame that refuses the cookie. `route.fetch` stores the
 * cookie in the browser's context first, and a request sent before it was cleared carried it and flipped the app to
 * cookie mode. The browser's other cookies of the address (the stub scenario) go along.
 */
async function exchange(page: Page, sent: SentRequest): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(sent.headers())) {
    if (!name.startsWith(":") && !OWN_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers[name] = value;
    }
  }
  const cookies = (await page.context().cookies(sent.url())).filter((cookie) => !/^homi_session/.test(cookie.name));
  if (cookies.length > 0) {
    headers.cookie = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }
  const data = sent.method() === "GET" || sent.method() === "HEAD" ? null : sent.postDataBuffer();
  const body = data === null ? undefined : new Uint8Array(data);
  const response = await fetch(sent.url(), { method: sent.method(), headers, body, redirect: "manual" });
  const answer: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (!DROPPED_ANSWER_HEADERS.has(name.toLowerCase())) {
      answer[name] = value;
    }
  });
  return { status: response.status, headers: answer, body: Buffer.from(await response.arrayBuffer()) };
}

async function startSessionMode(page: Page, mode: SessionMode, calls: (() => Promise<unknown>) | null): Promise<void> {
  await watchMode(page, mode, test.info().project.use.baseURL ?? "http://localhost:3001", calls);
  if (mode !== "header") {
    return;
  }
  // A context route runs after every page route, so a spec's own answer of the exchange (a refusal, a delay) wins
  // whether it was registered before this launch or after; whatever the spec passes on reaches this handler. Another
  // page of the context keeps its own mode.
  await page.context().route("**/bff/session", async (route) => {
    let own = true;
    try {
      own = route.request().frame().page() === page;
    } catch {
      own = true;
    }
    if (!own) {
      await route.fallback();
      return;
    }
    try {
      await trackExchange(
        (async () => {
          const answer = await exchange(page, route.request());
          await route.fulfill(answer);
        })(),
      );
    } catch (error) {
      // A test that ends with the exchange in flight closes the page under it ("route.fetch: Test ended"), and the
      // rejection would fail the next test. An answer Playwright disposed before it was fulfilled ("Fetch response has
      // been disposed", WP-82: a re-read of `GET /me` under a fast run of taps) is one the page no longer waits for —
      // a page still waiting would fail on its own. Only these ends are forgiven; anything else still fails the test.
      const ended = page.isClosed() || /Test ended|has been closed|response has been disposed/.test(error instanceof Error ? error.message : String(error));
      if (!ended) {
        throw error;
      }
    }
  });
}

/** Installs the fake Telegram as an init script of `page` (before any page script) and the request guard. */
export async function playwrightTelegram(page: Page, options: PlaywrightTelegramOptions = {}): Promise<PlaywrightTelegram> {
  const { allowHosts = [], mode = projectSessionMode(test.info()), ...fakeOptions } = withProfile(options);
  const state = await guard(page);
  for (const host of allowHosts) {
    state.allowHosts.add(host);
  }
  await page.addInitScript(installFakeTelegram, resolveFakeTelegramConfig(fakeOptions));
  const calls = () =>
    page.evaluate(() =>
      ((window as unknown as FakeTelegramWindow).__homiFakeTelegram?.calls ?? []).map((call) => ({
        member: call.member,
        args: call.args.map((arg) => (typeof arg === "function" ? "[function]" : arg)),
      })),
    );
  await startSessionMode(page, mode, calls);
  return {
    blockedRequests: state.blocked,
    calls,
  };
}

export interface LaunchAppOptions extends Omit<PlaywrightTelegramOptions, "initData" | "startParam"> {
  /**
   * `cookie` or `header`; default: the project's (`miniapp-cookie`, `miniapp-header`, WP-33). Header mode strips
   * `Set-Cookie` from the app's `/bff/session` answers, as the frame of a browser that refuses the cookie does (DEC-44,
   * RK-30). A spec names a mode only when the test is about that mode.
   */
  mode?: SessionMode;
  /** The Telegram user's `language_code`; default `ru`. */
  locale?: string;
  startParam?: string;
  /** A complete launch data string instead of the synthetic one. */
  initData?: string;
  /** The address the bot opens, with its query; default `/`. */
  path?: string;
  /**
   * `false`: no double at all, the SDK tag is aborted, and a spy on `TelegramWebviewProxy.postEvent` records the
   * bridge events (TMA-005).
   */
  sdk?: boolean;
}

export interface LaunchedApp extends PlaywrightTelegram {
  /** The launch data the app received. */
  readonly initData: string;
  /** `web_app_*` events the page posted through the native bridge; only with `sdk: false`. */
  bridgeEvents(): Promise<string[]>;
}

/**
 * Opens the Mini App as the bot does (WP-21): the fake Telegram (or none), the session mode, and the launch
 * parameters in the address fragment, where Telegram puts them.
 */
export async function launchApp(page: Page, options: LaunchAppOptions = {}): Promise<LaunchedApp> {
  const { mode = projectSessionMode(test.info()), locale = "ru", startParam, initData, path = "/", sdk = true, ...rest } = options;
  const telegram = withProfile(rest);
  const launchData = initData ?? syntheticInitData({ language_code: locale }, { startParam });
  let installed: PlaywrightTelegram;
  if (sdk) {
    installed = await playwrightTelegram(page, { ...telegram, initData: launchData, mode });
  } else {
    const state = await guard(page);
    await page.route(TELEGRAM_SDK_URL, (route) => route.abort("blockedbyclient"));
    await page.addInitScript(() => {
      const events: string[] = [];
      Object.assign(window, {
        __homiBridgeEvents: events,
        TelegramWebviewProxy: { postEvent: (eventType: string) => events.push(eventType) },
      });
    });
    installed = { blockedRequests: state.blocked, calls: async () => [] };
  }
  if (!sdk) {
    await startSessionMode(page, mode, null);
  }
  const config = resolveFakeTelegramConfig({ ...telegram, initData: launchData });
  const fragment = new URLSearchParams({ tgWebAppData: launchData, tgWebAppVersion: config.version, tgWebAppPlatform: config.platform });
  await page.goto(`${path}#${fragment.toString()}`);
  return {
    ...installed,
    initData: launchData,
    bridgeEvents: () => page.evaluate(() => [...((window as unknown as { __homiBridgeEvents?: string[] }).__homiBridgeEvents ?? [])]),
  };
}

/** The stub catalogue's photos (WP-12): `{media}/stub/<number>/<n>[.s].jpg?…` under `MEDIA_PUBLIC_URL` of `backend/.env.example`. */
export const STUB_MEDIA = /^https:\/\/cdn\.homi\.loc\/stub\//;

/** An 8 × 6 grey baseline JPEG of 338 bytes: an `<img>` answered with it decodes, so its `naturalWidth` is 8. */
const STUB_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAASABIAAD/wAALCAAGAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9sAQwAJCQkJCQkQCQkQFhAQEBYeFhYWFh4mHh4eHh4mLiYmJiYmJi4uLi4uLi4uNzc3Nzc3QEBAQEBISEhISEhISEhI/90ABAAB/9oACAEBAAA/APRK/9k=",
  "base64",
);

/**
 * Answers every stub photo of the local CDN (`STUB_MEDIA`) with `STUB_JPEG` (WP-24): CI has no DNS for
 * `cdn.homi.loc` and no stub media on disk (WP-33 brings them), and a developer machine may not have published them
 * (`php artisan sources:publish-stub-media`), so a spec that looks at photos answers them itself and the same images
 * load everywhere. It is a page route, so it answers before the guard, which lets `*.homi.loc` through to the network;
 * the browser still checks the address against the page's `img-src` first, so a policy without the CDN still blocks
 * the photo before any request. The returned list grows with the address of each photo answered.
 */
export async function stubMedia(page: Page): Promise<readonly string[]> {
  const answered: string[] = [];
  await page.route(STUB_MEDIA, async (route) => {
    answered.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: STUB_JPEG });
  });
  return answered;
}

export const test = base.extend<{ externalRequestGuard: void; sessionModeChecks: void }>({
  externalRequestGuard: [
    async ({ page }, use) => {
      const state = await guard(page);
      await use();
      expect(state.blocked, "requests to external hosts were sent by the page").toEqual([]);
    },
    { auto: true },
  ],
  // The checks of `./modes` after a test that launched the app and passed (WP-33): they belong to the suite, not to
  // the spec author.
  sessionModeChecks: [
    // It takes `page`, so its teardown runs while the page is still open.
    async ({ page }, use, info) => {
      void page;
      resetModeRecords();
      await use();
      if (info.status === "passed") {
        expect(await modeFindings(info), "the session mode and console checks after the test (@homi/testing modes.ts)").toEqual([]);
      }
    },
    { auto: true },
  ],
});

/**
 * The text a locator's element shows. A rolling number (`RollNumber` of `@homi/ui`, WP-39) holds a strip of 0 – 9 per
 * digit, so `toHaveText` would read digits nobody sees; here it counts as its plain number, its label. Poll it:
 * `await expect.poll(() => shownText(button)).toBe("Показать 12")`.
 */
export function shownText(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const copy = element.cloneNode(true) as Element;
    for (const roll of Array.from(copy.querySelectorAll('[data-slot="roll-number"]'))) {
      roll.replaceWith(roll.getAttribute("aria-label") ?? "");
    }
    return copy.textContent ?? "";
  });
}

export { expect };

/** For specs that launch a second Telegram user (WP-21). */
export { syntheticInitData };

export { allowConsoleErrors, allowCspViolations, projectSessionMode, type SessionMode } from "./modes";
/** For the checks' own spec (`app/e2e/modes.spec.ts`) only. */
export { modeFindings, resetModeRecords } from "./modes";
export { STUB_SCENARIO_COOKIE, setScenario, withScenario } from "./scenarios";
