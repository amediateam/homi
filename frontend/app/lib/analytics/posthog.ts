import type { CaptureResult, PostHog, PostHogConfig } from "posthog-js";

import { reportError, setRenderHook } from "@/lib/errors/report";

import { whenFirstContent } from "./firstContent";
import { isAppAddress, scrubDeep, stripUrl } from "./scrub";

/**
 * PostHog for the Mini App (WP-32, `03` §3.3, §1.7, §1.9; DEC-47, SEC-021, SEC-REQ-036): HOMI's own project per
 * environment, loaded lazily under the legacy rules. Nothing is imported without the key and host of the environment,
 * with `analytics: null` or without a `distinct_id` in `GET /me`, with Save-Data or on a `2g` / `slow-2g` connection.
 * Otherwise, once per launch: the first loaded photo (or 8 s), then 500 ms, then `import('posthog-js')` and the
 * extensions this launch uses — web vitals and exception capture always, dead clicks with autocapture, the recorder
 * only when the launch is sampled for replay (never in lite mode). The SDK loads nothing from PostHog's hosts
 * (`disable_external_dependency_loading`), keeps everything in memory (no cookie, no storage), takes no automatic
 * pageview, and is identified by the server-issued id. Pageviews are manual (`trackScreen`), with the screen names of
 * `screenNameOf`; before load only the last screen waits. `before_send` keeps origin and path of every address and
 * scrubs every property except replay snapshots; replay masks every text and input.
 */

export type AnalyticsMe = {
  analytics: { distinct_id: string; autocapture: boolean; replay: boolean; replay_rate: number } | null;
  team: boolean;
};

export type AnalyticsConfig = {
  key: string | undefined;
  host: string | undefined;
  env: string;
  build: string;
  locale: string;
  sessionMode: "cookie" | "header";
  me: AnalyticsMe;
};

type Connection = { saveData?: boolean; effectiveType?: string };

/** Load 500 ms after the first content, or after 8 s without one. */
export const FIRST_CONTENT_WAIT_MS = 8000;
export const AFTER_CONTENT_MS = 500;

const URL_KEYS = ["$current_url", "$referrer", "$initial_current_url", "$pathname", "$initial_referrer", "$initial_pathname"];

let started = false;
let instance: PostHog | null = null;
let pending: { screen: string; props: Record<string, unknown> } | null = null;
let lastScreen: string | null = null;
const onceNames = new Set<string>();
const onceWaiting: string[] = [];

/** Whether this launch may load PostHog at all. */
export function analyticsAllowed(config: AnalyticsConfig, connection: Connection | undefined = connectionOf()): boolean {
  if (!config.key || !config.host || config.me.analytics === null || !config.me.analytics.distinct_id) {
    return false;
  }
  if (connection?.saveData === true) {
    return false;
  }
  return connection?.effectiveType !== "2g" && connection?.effectiveType !== "slow-2g";
}

function connectionOf(): Connection | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: Connection }).connection;
}

/** Whether this launch records a replay: the profile allows it, the sampling picks it, and lite mode is off. */
export function replaySampled(me: AnalyticsMe, random: () => number = Math.random): boolean {
  const analytics = me.analytics;
  if (analytics === null || !analytics.replay || document.documentElement.classList.contains("lite")) {
    return false;
  }
  return random() < (Number.isFinite(analytics.replay_rate) ? analytics.replay_rate : 1);
}

/** Keeps origin and path of every address in the event and scrubs everything but replay snapshots. */
export function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (event === null || event.event === "$snapshot") {
    return event;
  }
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const clean = (properties: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    if (properties === undefined) {
      return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (key.startsWith("$snapshot")) {
        out[key] = value;
      } else if (typeof value === "string" && (URL_KEYS.includes(key) || isAppAddress(value, origin))) {
        out[key] = stripUrl(value);
      } else if (key === "$set" || key === "$set_once") {
        out[key] = clean(value as Record<string, unknown>);
      } else {
        out[key] = scrubDeep(value);
      }
    }
    return out;
  };
  return { ...event, properties: clean(event.properties) ?? {}, ...(event.$set ? { $set: clean(event.$set) } : {}), ...(event.$set_once ? { $set_once: clean(event.$set_once) } : {}) } as CaptureResult;
}

/** The options of `posthog.init`, as legacy (`03` §3.3) with the replay masking of SEC-REQ-036. */
export function optionsOf(config: AnalyticsConfig, replay: boolean): Partial<PostHogConfig> {
  const analytics = config.me.analytics!;
  const autocapture = analytics.autocapture !== false;
  return {
    api_host: config.host,
    disable_external_dependency_loading: true,
    persistence: "memory",
    disable_capture_url_hashes: true,
    autocapture: autocapture
      ? { dom_event_allowlist: ["click", "change", "submit"], element_attribute_ignorelist: ["href", "src", "srcset"], capture_copied_text: false }
      : false,
    rageclick: autocapture,
    capture_dead_clicks: autocapture,
    enable_heatmaps: autocapture,
    capture_pageview: false,
    capture_pageleave: false,
    disable_surveys: true,
    capture_performance: { web_vitals: true, network_timing: false },
    enable_recording_console_log: false,
    capture_exceptions: true,
    person_profiles: "identified_only",
    bootstrap: { distinctID: analytics.distinct_id, isIdentifiedID: true },
    disable_session_recording: !replay,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskCapturedNetworkRequestFn: (request) => ({ ...request, name: stripUrl(request.name) }),
    },
    before_send: beforeSend,
  };
}

/** Removes Telegram's launch data from the address if it is still there (WP-21 removes it at boot, TMA-009). */
function assertNoLaunchData(): void {
  const { pathname, search, hash } = window.location;
  if (!search.includes("tgWebAppData") && !hash.includes("tgWebAppData")) {
    return;
  }
  window.history.replaceState(window.history.state, "", pathname);
  reportError(new Error("tgWebAppData left in the address"), { kind: "error", source: "analytics" });
}

function send(screen: string, props: Record<string, unknown>): void {
  instance?.capture("$pageview", { ...props, screen, $current_url: `${window.location.origin}/${screen}`, $pathname: `/${screen}` });
}

/** Loads PostHog once per launch when this launch allows it (`analyticsAllowed`). */
export function initAnalytics(config: AnalyticsConfig): void {
  if (started || typeof window === "undefined") {
    return;
  }
  started = true;
  if (!analyticsAllowed(config)) {
    return;
  }
  const replay = replaySampled(config.me);
  const autocapture = config.me.analytics!.autocapture !== false;
  void (async () => {
    await whenFirstContent(FIRST_CONTENT_WAIT_MS);
    await new Promise((resolve) => setTimeout(resolve, AFTER_CONTENT_MS));
    assertNoLaunchData();
    const [{ default: posthog }] = await Promise.all([
      import("posthog-js"),
      import("posthog-js/dist/web-vitals"),
      import("posthog-js/dist/exception-autocapture"),
      autocapture ? import("posthog-js/dist/dead-clicks-autocapture") : null,
      replay ? import("posthog-js/dist/posthog-recorder") : null,
    ]);
    posthog.init(config.key!, optionsOf(config, replay));
    posthog.register({ env: config.env, build: config.build, team: config.me.team, locale: config.locale, session_mode: config.sessionMode });
    instance = posthog;
    setRenderHook((error) => posthog.captureException(error));
    if (pending !== null) {
      send(pending.screen, pending.props);
      pending = null;
    }
    for (const name of onceWaiting.splice(0)) {
      posthog.capture(name);
    }
  })().catch(() => {
    // PostHog failing to load changes nothing.
  });
}

/**
 * A pageview of `screen` (`ScreenTracker`): the same screen and listing as the last one is skipped; before PostHog is
 * loaded only the last screen is kept, and sent right after `init`.
 */
export function trackScreen(screen: string, props: { listing_id?: number } = {}): void {
  const id = `${screen}:${props.listing_id ?? ""}`;
  if (id === lastScreen) {
    return;
  }
  lastScreen = id;
  if (instance === null) {
    pending = { screen, props };
    return;
  }
  send(screen, props);
}

/** An event without properties sent once per launch (PostHog only): `session_expired`. */
export function captureOnce(name: string): void {
  if (onceNames.has(name)) {
    return;
  }
  onceNames.add(name);
  if (instance === null) {
    onceWaiting.push(name);
    return;
  }
  instance.capture(name);
}

/** Tests only. */
export function resetAnalytics(): void {
  started = false;
  instance = null;
  pending = null;
  lastScreen = null;
  onceNames.clear();
  onceWaiting.length = 0;
  setRenderHook(null);
}
