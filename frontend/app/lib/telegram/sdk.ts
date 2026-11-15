import type { HomiBoot, TelegramHost, TgUser, TgWebApp } from "./types";

/**
 * The only module that reads `window.Telegram`, the native bridges and the launch fragment (DEC-44, `25` §3.3).
 * Everything else goes through the facade `tg` of `./index.ts`. Outside a browser every function answers as
 * "outside Telegram".
 */

/** The official SDK (TMA-001); unpinned, whatever telegram.org serves. */
export const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

function host(): TelegramHost | null {
  return typeof window === "undefined" ? null : (window as unknown as TelegramHost);
}

export interface LaunchFragment {
  initData: string | null;
  version: string | null;
  platform: string | null;
}

function readFragment(): LaunchFragment {
  const empty: LaunchFragment = { initData: null, version: null, platform: null };
  if (typeof window === "undefined") {
    return empty;
  }
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return {
      initData: params.get("tgWebAppData") || null,
      version: params.get("tgWebAppVersion") || null,
      platform: params.get("tgWebAppPlatform") || null,
    };
  } catch {
    return empty;
  }
}

/**
 * Read once, when the module is evaluated (TMA-006): the SDK reads the same fragment when it loads, and
 * `scrubLaunchFragment` removes it from the address later (TMA-009).
 */
const fragment = readFragment();

export function launchFragment(): LaunchFragment {
  return { ...fragment };
}

/** The live SDK object; a late SDK replaces it (TMA-004), so callers never keep it. */
export function webApp(): TgWebApp | null {
  return host()?.Telegram?.WebApp ?? null;
}

export function bootState(): HomiBoot | null {
  return host()?.__homiBoot ?? null;
}

export function sdkTag(): HTMLScriptElement | null {
  return typeof document === "undefined" ? null : (document.getElementById("tg-sdk") as HTMLScriptElement | null);
}

export function webView(): NonNullable<NonNullable<TelegramHost["Telegram"]>["WebView"]> | null {
  return host()?.Telegram?.WebView ?? null;
}

/** Inside Telegram: an SDK object that carries launch data. A desktop browser that loaded the SDK is outside. */
export function insideTelegram(): TgWebApp | null {
  const app = webApp();
  return app !== null && hasInitData() ? app : null;
}

/** The unsigned user of the launch data: only to pick a language and to tell two accounts apart (`25` §3.4). */
export function launchUser(): TgUser | null {
  const fromSdk = webApp()?.initDataUnsafe?.user;
  if (fromSdk) {
    return fromSdk;
  }
  try {
    const user = new URLSearchParams(initData()).get("user");
    return user ? (JSON.parse(user) as TgUser) : null;
  } catch {
    return null;
  }
}

export function platform(): string {
  return webApp()?.platform || fragment.platform || "unknown";
}

export function version(): string {
  return webApp()?.version || fragment.version || "";
}

/** A call a client refuses degrades to nothing (TMA-042). */
export function attempt(run: () => void): void {
  try {
    run();
  } catch {
    // Refused by this client: nothing to do.
  }
}

/** The SDK's `initData`, else the fragment's (TMA-006). Sent once to `POST /bff/session`, nowhere else (TMA-007). */
export function initData(): string {
  return webApp()?.initData || fragment.initData || "";
}

export function hasInitData(): boolean {
  return initData() !== "";
}

/**
 * Removes the launch fragment from the address, keeping the path, the query and the router's history state
 * (TMA-009). Called after the SDK wait settled — the SDK reads the fragment at load — and before any analytics code.
 */
export function scrubLaunchFragment(): void {
  if (typeof window === "undefined" || window.location.hash === "") {
    return;
  }
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  } catch {
    // A sandboxed frame may refuse history calls; the fragment then stays, as in legacy.
  }
}

/**
 * Posts a `web_app_*` event without the SDK (TMA-005), in the SDK's own order: the mobile proxy, the Windows
 * `external.notify`, then the parent frame of Telegram Web. Returns whether a bridge took it.
 */
export function postBridgeEvent(eventType: string, eventData?: unknown): boolean {
  const globals = host();
  if (globals === null) {
    return false;
  }
  const message = JSON.stringify(eventData === undefined ? { eventType } : { eventType, eventData });
  try {
    if (typeof globals.TelegramWebviewProxy?.postEvent === "function") {
      globals.TelegramWebviewProxy.postEvent(eventType, eventData === undefined ? undefined : JSON.stringify(eventData));
      return true;
    }
    if (typeof globals.external?.notify === "function") {
      globals.external.notify(message);
      return true;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, "*");
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Wraps an SDK event handler (TMA-044): an exception is caught, so the SDK's dispatcher keeps serving the next
 * event, and rethrown on a zero timeout, so the global error handler reports it once.
 */
export function safeCallback<A extends unknown[]>(handler: (...args: A) => void): (...args: A) => void {
  return function (this: unknown, ...args: A): void {
    try {
      handler.apply(this, args);
    } catch (error) {
      setTimeout(() => {
        throw error;
      }, 0);
    }
  };
}
