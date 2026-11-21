import { BUILD_VERSION } from "@/lib/analytics/buildVersion";
import { track } from "@/lib/analytics/events";
import { parseLaunch, type Launch } from "@/lib/deeplinks/parse";
import { restoreFromDeviceStorage } from "@/lib/storage";
import {
  initTelegramApp,
  launchUser,
  scrubLaunchFragment,
  SDK_WAIT_MS,
  setThemePreference,
  tg,
  waitForSdk,
  type SdkOutcome,
} from "@/lib/telegram";

import { clearAuth, getAuth, setCookieAuth, setHeaderAuth, tokenExpiry } from "./store";
import { accessReason, type AccessReason, type Me } from "./types";

/**
 * The session of one launch (WP-21, `25` §3.4, ADR-0018): wait for the SDK and restore DeviceStorage, then reuse a
 * valid cookie of the same Telegram user, or trade the launch data for a session once through `/bff/session`.
 * `SessionProvider` renders from this store; WP-22 calls `reauthenticate()` on any `401`.
 */

export type SessionStatus = "booting" | "ready" | "outside" | "denied" | "expired";
export type SessionMode = "cookie" | "header";
/** The `UiError` kinds of WP-22 that a sign-in can end in. */
export type SessionError = "offline" | "timeout" | "server" | "rate_limited";

export interface SessionState {
  status: SessionStatus;
  /**
   * The SDK wait, the DeviceStorage restore and the fragment scrub are done. Navigations wait for it: the scrub's
   * `history.replaceState` would undo one that is still pending.
   */
  prepared: boolean;
  mode: SessionMode | null;
  me: Me | null;
  reason: AccessReason | null;
  /** The outcome of the last attempt that failed without an answer of the API; set only while `booting`. */
  error: SessionError | null;
  /**
   * An attempt (the first one, a `retry()`, the start after a late SDK) is in flight. A re-check of a refusal keeps
   * `status: 'denied'` and its `reason` meanwhile, so the access screen can say it is checking (WP-23).
   */
  pending: boolean;
  /**
   * This launch signed in (`establish()`) instead of confirming the cookie the document came with, so what the
   * server rendered before was read with no cookie, a revoked one or another user's (the feed's page one, WP-24).
   * Decided before the first `ready` of the launch and kept: a later re-authentication does not change it.
   */
  renewed: boolean;
}

const REQUEST_TIMEOUT_MS = 15_000;
/** `v` of `app_launch`: the app build; empty until WP-32 sets the build version. */

const initial: SessionState = { status: "booting", prepared: false, mode: null, me: null, reason: null, error: null, pending: false, renewed: false };
let state: SessionState = initial;
const listeners = new Set<() => void>();

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(change: Partial<SessionState>): void {
  state = { ...state, ...change };
  for (const listener of listeners) {
    listener();
  }
}

/** `status` 0 with `error` when the request never completed. */
type Http = { status: number; body: Record<string, unknown> | null; error: SessionError | null };

async function call(method: "GET" | "POST", options: { token?: string; body?: string } = {}): Promise<Http> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token !== undefined) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  try {
    const response = await fetch("/bff/session", {
      method,
      headers,
      body: options.body,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let body: Record<string, unknown> | null = null;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }
    return { status: response.status, body, error: null };
  } catch (error) {
    return { status: 0, body: null, error: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "offline" };
  }
}

function failure(http: Http): SessionError {
  if (http.error !== null) {
    return http.error;
  }
  return http.status === 429 ? "rate_limited" : "server";
}

type Read =
  | { kind: "session"; mode: SessionMode; me: Me; user: string | null }
  | { kind: "none" }
  | { kind: "unauthorized" }
  | { kind: "denied"; reason: AccessReason }
  | { kind: "failed"; error: SessionError };

async function readSession(token?: string): Promise<Read> {
  const http = await call("GET", { token });
  if (http.status === 200 && http.body !== null) {
    const { mode, me, user } = http.body as { mode?: unknown; me?: unknown; user?: unknown };
    if (mode === "none") {
      return { kind: "none" };
    }
    if ((mode === "cookie" || mode === "header") && typeof me === "object" && me !== null) {
      return { kind: "session", mode, me: me as Me, user: typeof user === "string" ? user : null };
    }
  }
  if (http.status === 401) {
    return { kind: "unauthorized" };
  }
  if (http.status === 403) {
    return { kind: "denied", reason: accessReason(http.body?.reason) };
  }
  return { kind: "failed", error: failure(http) };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The unsigned user id of the launch data decides only whether to sign in again (`25` §3.4). */
async function belongsToLaunchUser(user: string | null): Promise<boolean> {
  const id = launchUser()?.id;
  if (user === null || typeof id !== "number") {
    return false;
  }
  try {
    return (await sha256(String(id))) === user;
  } catch {
    return false;
  }
}

/** Saved changes of this launch, applied again over every later read of `me` (a stub `/me` never changes). */
let patches: Partial<Me> = {};
let launch: Launch | null = null;
let opened = false;
/** `renewed` of the launch: set once `run()` signs in, never cleared. */
let renewed = false;

function ready(mode: SessionMode, me: Me): "ready" {
  const merged = { ...me, ...patches };
  setThemePreference(merged.theme);
  update({ status: "ready", mode, me: merged, reason: null, error: null, renewed });
  if (!opened && launch !== null) {
    opened = true;
    const ms = Math.round(performance.now());
    track("app_opened", launch.entry === "link" && launch.listingNumber !== null ? { entry: "link", listing_id: launch.listingNumber, ms } : { entry: launch.entry === "link" ? "menu" : launch.entry, ms });
  }
  return "ready";
}

/** Step 4 of `25` §3.4: sign in with this launch's data, then find out whether the cookie came back. */
async function establish(): Promise<"ready" | "expired" | "denied" | SessionError> {
  const http = await call("POST", { body: JSON.stringify({ initData: tg.initData() }) });
  if (http.status === 401) {
    clearAuth();
    update({ status: "expired", mode: null, error: null });
    return "expired";
  }
  if (http.status === 403) {
    update({ status: "denied", reason: accessReason(http.body?.reason), error: null });
    return "denied";
  }
  const token = http.status === 200 ? http.body?.token : undefined;
  const expiresAt = http.status === 200 && typeof http.body?.expiresAt === "string" ? http.body.expiresAt : null;
  if (typeof token !== "string") {
    return failure(http);
  }

  const check = await readSession();
  if (check.kind === "session" && check.mode === "cookie") {
    setCookieAuth(expiresAt);
    return ready("cookie", check.me);
  }
  if (check.kind !== "none") {
    return check.kind === "failed" ? check.error : "server";
  }
  // The frame refused the cookie: header mode, the token in memory only.
  setHeaderAuth(token, expiresAt);
  const withHeader = await readSession(token);
  if (withHeader.kind === "session") {
    return ready("header", withHeader.me);
  }
  if (withHeader.kind === "denied") {
    update({ status: "denied", reason: withHeader.reason, error: null });
    return "denied";
  }
  return withHeader.kind === "failed" ? withHeader.error : "server";
}

let prepared: Promise<SdkOutcome> | null = null;

/** Once per launch: the SDK wait, then the DeviceStorage restore (it needs the SDK), init, and the fragment scrub. */
function prepare(): Promise<SdkOutcome> {
  prepared ??= (async () => {
    const outcome = await waitForSdk(SDK_WAIT_MS, () => {
      initTelegramApp();
      // SCR-002: a late SDK that brings launch data starts the session the outside page waits for. Earlier, while the
      // bootstrap still prepares, `run()` finds the launch data itself.
      if (state.status === "outside" && tg.hasInitData()) {
        void attempt();
      }
    });
    await restoreFromDeviceStorage();
    initTelegramApp();
    // After the SDK read its launch parameters and before any analytics call (TMA-009).
    scrubLaunchFragment();
    tg.onVisible(() => {
      const expiry = tokenExpiry();
      if (state.status === "ready" && expiry !== null && Date.now() >= expiry) {
        void reauthenticate();
      }
    });
    return outcome;
  })();
  return prepared;
}

const jsStart = typeof performance === "undefined" ? 0 : Math.round(performance.now());

/**
 * One attempt. A re-check of a refusal (`retry()` while `denied`) stays `denied` until the answer: `ready` when
 * access was granted meanwhile, `denied` with the new reason on another refusal, and the refusal as it was when the
 * API could not be reached.
 */
async function run(): Promise<void> {
  const outcome = await prepare();
  if (!tg.hasInitData()) {
    update({ status: "outside", prepared: true });
    return;
  }
  if (launch === null) {
    launch = parseLaunch(tg.initData(), typeof window === "undefined" ? "" : window.location.search);
    track("app_launch", {
      entry: launch.entry,
      ms: Math.round(performance.now()),
      v: BUILD_VERSION,
      sdk: outcome,
      js: String(jsStart),
      platform: tg.platform(),
      tg: tg.version(),
    });
  }
  const recheck = state.status === "denied";
  update(recheck ? { prepared: true, error: null } : { status: "booting", prepared: true, error: null });
  const failed = (error: SessionError): void => {
    if (!recheck) {
      update({ status: "booting", error });
    }
  };

  const current = await readSession();
  if (current.kind === "session" && current.mode === "cookie" && (await belongsToLaunchUser(current.user))) {
    setCookieAuth(null);
    ready("cookie", current.me);
    return;
  }
  if (current.kind === "denied") {
    update({ status: "denied", reason: current.reason, error: null });
    return;
  }
  if (current.kind === "failed") {
    failed(current.error);
    return;
  }
  // A sign-in may set the cookie even when its attempt fails later: a retry that then confirms it still renews.
  renewed = true;
  const result = await establish();
  if (result !== "ready" && result !== "expired" && result !== "denied") {
    failed(result);
  }
}

let started: Promise<void> | null = null;
let inFlight: Promise<void> | null = null;

/** Runs one attempt with `pending` set; while one is in flight every caller gets its promise. */
function attempt(): Promise<void> {
  if (inFlight !== null) {
    return inFlight;
  }
  update({ pending: true });
  inFlight = run().finally(() => {
    inFlight = null;
    update({ pending: false });
  });
  return inFlight;
}

/** Starts the session once per launch; a second call (a double effect) gets the same promise. */
export function startSession(): Promise<void> {
  started ??= attempt();
  return started;
}

/**
 * Runs the bootstrap again while it is booting (after a failed attempt) or `denied` (the re-check of a refusal);
 * anything else is left alone. It never starts a second attempt while one is in flight: it returns that attempt.
 * WP-23 owns the timers that call it (`features/gates/useBootRetry.ts`).
 */
export function retry(): Promise<void> {
  if (inFlight !== null) {
    return inFlight;
  }
  if (state.status !== "booting" && state.status !== "denied") {
    return Promise.resolve();
  }
  started = attempt();
  return started;
}

let reauthenticating: Promise<boolean> | null = null;

/**
 * On any `401` (WP-22) and when the app becomes visible after the token's expiry: sign in again with this launch's
 * data, one attempt shared by all callers. A refused sign-in is `expired`; nothing is retried after that.
 */
export function reauthenticate(): Promise<boolean> {
  if (state.status === "expired" || state.status === "outside") {
    return Promise.resolve(false);
  }
  reauthenticating ??= establish()
    .then((result) => result === "ready")
    .finally(() => {
      reauthenticating = null;
    });
  return reauthenticating;
}

let refreshing: Promise<void> | null = null;

/**
 * Re-reads `me` after a settings change or a cabinet mutation (WP-82: the pending count); the patches of this launch
 * stay applied. Concurrent re-reads share one request.
 */
export function refresh(): Promise<void> {
  refreshing ??= (async () => {
    try {
      const auth = getAuth();
      const read = await readSession(auth.mode === "header" ? auth.token : undefined);
      if (read.kind === "session" && state.status === "ready") {
        update({ me: { ...read.me, ...patches } });
      }
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * A `403` of a later read while `dev001AnyForbiddenShowsAccess` is on (LB-APP-045, WP-22): the session turns
 * `denied` and the access screen replaces the app, as the refusal at launch does.
 */
export function onForbidden(reason?: unknown): void {
  if (state.status === "ready") {
    update({ status: "denied", reason: accessReason(reason), error: null });
  }
}

/** Merges a saved change (`locale`, `currency`, `theme`, `city`, the two "chosen" marks) into `me` at once. */
export function patchMe(change: Partial<Pick<Me, "locale" | "currency" | "theme" | "city" | "locale_chosen" | "city_chosen">>): void {
  patches = { ...patches, ...change };
  if (state.me !== null) {
    update({ me: { ...state.me, ...change } });
  }
}
