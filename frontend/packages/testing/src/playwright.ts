import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

import { installFakeTelegram, resolveFakeTelegramConfig, type FakeTelegramCall, type FakeTelegramOptions, type FakeTelegramWindow } from "./fakeTelegram";
import { syntheticInitData } from "./initData";

/**
 * Playwright side of `@homi/testing` (WP-03). Specs import `test` and `expect` from here: every test then runs behind
 * a guard that stops each request to a host other than the app under test and fails the test when one was stopped
 * (`telegram.org`, PostHog, OpenStreetMap, any tile host — DEC-33). The one exception is the SDK tag of the Mini
 * App's layout (WP-21): it is answered here with an empty script, so the fake stays the SDK and nothing leaves the
 * machine. Any other request to telegram.org — a `fetch` of the same address included — still fails the test.
 */

/** The `<script id="tg-sdk">` of `frontend/app/app/[locale]/layout.tsx` (TMA-001). */
export const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

export interface PlaywrightTelegramOptions extends FakeTelegramOptions {
  /**
   * Hosts a spec answers itself with `page.route` from a fixture (tiles, media — WP-27). Their requests that the
   * spec does not fulfil are aborted without failing the test; none of them ever leaves the machine.
   */
  allowHosts?: string[];
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
    if (!state.allowHosts.has(url.hostname)) {
      state.blocked.push(url.href);
    }
    await route.abort("blockedbyclient");
  });
  return state;
}

/** Installs the fake Telegram as an init script of `page` (before any page script) and the request guard. */
export async function playwrightTelegram(page: Page, options: PlaywrightTelegramOptions = {}): Promise<PlaywrightTelegram> {
  const { allowHosts = [], ...fakeOptions } = options;
  const state = await guard(page);
  for (const host of allowHosts) {
    state.allowHosts.add(host);
  }
  await page.addInitScript(installFakeTelegram, resolveFakeTelegramConfig(fakeOptions));
  return {
    blockedRequests: state.blocked,
    calls: () =>
      page.evaluate(() =>
        ((window as unknown as FakeTelegramWindow).__homiFakeTelegram?.calls ?? []).map((call) => ({
          member: call.member,
          args: call.args.map((arg) => (typeof arg === "function" ? "[function]" : arg)),
        })),
      ),
  };
}

export interface LaunchAppOptions extends Omit<PlaywrightTelegramOptions, "initData" | "startParam"> {
  /**
   * `cookie` (default) or `header`: header mode strips `Set-Cookie` from the app's `/bff/session` answers, as the
   * frame of a browser that refuses the cookie does (DEC-44, RK-30).
   */
  mode?: "cookie" | "header";
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
  const { mode = "cookie", locale = "ru", startParam, initData, path = "/", sdk = true, ...telegram } = options;
  const launchData = initData ?? syntheticInitData({ language_code: locale }, { startParam });
  let installed: PlaywrightTelegram;
  if (sdk) {
    installed = await playwrightTelegram(page, { ...telegram, initData: launchData });
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
  if (mode === "header") {
    await page.route("**/bff/session", async (route) => {
      const response = await route.fetch();
      const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => name.toLowerCase() !== "set-cookie"));
      await route.fulfill({ response, headers });
    });
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

export const test = base.extend<{ externalRequestGuard: void }>({
  externalRequestGuard: [
    async ({ page }, use) => {
      const state = await guard(page);
      await use();
      expect(state.blocked, "requests to external hosts were sent by the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
