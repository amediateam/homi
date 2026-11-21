import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loaded: [] as string[],
  init: vi.fn<(key: string, options: Record<string, unknown>) => void>(),
  capture: vi.fn<(name: string, props?: Record<string, unknown>) => void>(),
  register: vi.fn<(props: Record<string, unknown>) => void>(),
  captureException: vi.fn<(error: Error) => void>(),
}));
vi.mock("posthog-js", () => {
  state.loaded.push("posthog-js");
  return { default: { init: state.init, capture: state.capture, register: state.register, captureException: state.captureException } };
});
vi.mock("posthog-js/dist/web-vitals-with-attribution", () => (state.loaded.push("web-vitals"), {}));
vi.mock("posthog-js/dist/exception-autocapture", () => (state.loaded.push("exception-autocapture"), {}));
vi.mock("posthog-js/dist/dead-clicks-autocapture", () => (state.loaded.push("dead-clicks-autocapture"), {}));
vi.mock("posthog-js/dist/posthog-recorder", () => (state.loaded.push("posthog-recorder"), {}));

import { markFirstContent, resetFirstContent } from "@/lib/analytics/firstContent";
import {
  AFTER_CONTENT_MS,
  type AnalyticsConfig,
  analyticsAllowed,
  beforeSend,
  captureOnce,
  FIRST_CONTENT_WAIT_MS,
  initAnalytics,
  optionsOf,
  replaySampled,
  resetAnalytics,
  trackScreen,
} from "@/lib/analytics/posthog";
import { clearRecentErrors, reportError } from "@/lib/errors/report";

const ME = { analytics: { distinct_id: "d-1", autocapture: true, replay: false, replay_rate: 1 }, team: false };
const CONFIG: AnalyticsConfig = { key: "phc_test", host: "https://ph.invalid", env: "ci", build: "dev", locale: "ru", sessionMode: "cookie", me: ME };

/** Lets the loader run to its end: the first-content race, the 500 ms, the dynamic imports. */
async function loadAfter(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
  await vi.dynamicImportSettled();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  resetAnalytics();
  resetFirstContent();
  clearRecentErrors();
  state.loaded = [];
  for (const mock of [state.init, state.capture, state.register, state.captureException]) {
    mock.mockReset();
  }
  document.documentElement.classList.remove("lite");
});

afterEach(() => {
  vi.useRealTimers();
  resetAnalytics();
});

describe("analyticsAllowed (WP-32, 03 §3.3)", () => {
  it("needs the key, the host and the profile's distinct id; never with Save-Data or 2g", () => {
    expect(analyticsAllowed(CONFIG, {})).toBe(true);
    expect(analyticsAllowed({ ...CONFIG, key: undefined }, {})).toBe(false);
    expect(analyticsAllowed({ ...CONFIG, host: "" }, {})).toBe(false);
    expect(analyticsAllowed({ ...CONFIG, me: { ...ME, analytics: null } }, {})).toBe(false);
    expect(analyticsAllowed({ ...CONFIG, me: { ...ME, analytics: { ...ME.analytics, distinct_id: "" } } }, {})).toBe(false);
    expect(analyticsAllowed(CONFIG, { saveData: true })).toBe(false);
    expect(analyticsAllowed(CONFIG, { effectiveType: "2g" })).toBe(false);
    expect(analyticsAllowed(CONFIG, { effectiveType: "slow-2g" })).toBe(false);
    expect(analyticsAllowed(CONFIG, { effectiveType: "4g" })).toBe(true);
  });
});

describe("initAnalytics: timing and imports", () => {
  it("imports nothing when not allowed", async () => {
    initAnalytics({ ...CONFIG, key: undefined });
    await loadAfter(FIRST_CONTENT_WAIT_MS + AFTER_CONTENT_MS + 100);

    expect(state.loaded).toEqual([]);
    expect(state.init).not.toHaveBeenCalled();
  });

  it("loads 500 ms after the first content, not before", async () => {
    initAnalytics(CONFIG);
    markFirstContent();
    await loadAfter(AFTER_CONTENT_MS - 50);
    expect(state.init).not.toHaveBeenCalled();

    await loadAfter(60);
    expect(state.init).toHaveBeenCalledTimes(1);
    expect(state.loaded).toEqual(expect.arrayContaining(["posthog-js", "web-vitals", "exception-autocapture", "dead-clicks-autocapture"]));
    expect(state.loaded).not.toContain("posthog-recorder");
  });

  it("loads at 8.5 s without any content; once per launch", async () => {
    initAnalytics(CONFIG);
    initAnalytics(CONFIG);
    await loadAfter(FIRST_CONTENT_WAIT_MS + AFTER_CONTENT_MS - 100);
    expect(state.init).not.toHaveBeenCalled();
    await loadAfter(200);

    expect(state.init).toHaveBeenCalledTimes(1);
    expect(state.register).toHaveBeenCalledWith({ env: "ci", build: "dev", team: false, locale: "ru", session_mode: "cookie" });
  });

  it("sends the pending screen once after load, and later screens at once; the same screen twice is one", async () => {
    trackScreen("search/list");
    trackScreen("listing", { listing_id: 41 });
    initAnalytics(CONFIG);
    markFirstContent();
    await loadAfter(AFTER_CONTENT_MS + 10);

    expect(state.capture.mock.calls.filter(([name]) => name === "$pageview")).toHaveLength(1);
    expect(state.capture).toHaveBeenCalledWith("$pageview", expect.objectContaining({ screen: "listing", listing_id: 41, $pathname: "/listing" }));
    trackScreen("listing", { listing_id: 41 });
    trackScreen("listing", { listing_id: 42 });
    expect(state.capture.mock.calls.filter(([name]) => name === "$pageview")).toHaveLength(2);
  });

  it("hooks render reports into the exception capture, and sends session_expired once", async () => {
    captureOnce("session_expired");
    captureOnce("session_expired");
    initAnalytics(CONFIG);
    markFirstContent();
    await loadAfter(AFTER_CONTENT_MS + 10);
    reportError(new Error("render"), { kind: "render" });

    expect(state.captureException).toHaveBeenCalledTimes(1);
    expect(state.capture.mock.calls.filter(([name]) => name === "session_expired")).toHaveLength(1);
  });

  it("imports the recorder only for a sampled launch, never in lite mode", async () => {
    const sampled = { ...CONFIG, me: { ...ME, analytics: { ...ME.analytics, replay: true, replay_rate: 0.5 } } };
    expect(replaySampled(sampled.me, () => 0.4)).toBe(true);
    expect(replaySampled(sampled.me, () => 0.6)).toBe(false);
    expect(replaySampled(CONFIG.me, () => 0)).toBe(false);
    document.documentElement.classList.add("lite");
    expect(replaySampled(sampled.me, () => 0)).toBe(false);
    document.documentElement.classList.remove("lite");

    vi.spyOn(Math, "random").mockReturnValue(0.1);
    initAnalytics(sampled);
    markFirstContent();
    await loadAfter(AFTER_CONTENT_MS + 10);
    expect(state.loaded).toContain("posthog-recorder");
    expect(state.init.mock.calls[0]?.[1]).toMatchObject({ disable_session_recording: false });
  });
});

describe("the options and before_send", () => {
  it("as legacy: memory only, no automatic pageview, identified by the server's id, every text masked in replays", () => {
    const options = optionsOf(CONFIG, false);
    expect(options).toMatchObject({
      api_host: "https://ph.invalid",
      disable_external_dependency_loading: true,
      persistence: "memory",
      disable_capture_url_hashes: true,
      autocapture: { dom_event_allowlist: ["click", "change", "submit"], element_attribute_ignorelist: ["href", "src", "srcset"], capture_copied_text: false },
      rageclick: true,
      enable_heatmaps: true,
      capture_pageview: false,
      capture_pageleave: false,
      disable_surveys: true,
      capture_performance: { web_vitals: true, network_timing: false },
      enable_recording_console_log: false,
      capture_exceptions: true,
      person_profiles: "identified_only",
      bootstrap: { distinctID: "d-1", isIdentifiedID: true },
      disable_session_recording: true,
      session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    });
    expect(optionsOf({ ...CONFIG, me: { ...ME, analytics: { ...ME.analytics, autocapture: false } } }, false)).toMatchObject({
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
    });
    const mask = (options.session_recording as unknown as { maskCapturedNetworkRequestFn: (request: { name: string }) => { name: string } }).maskCapturedNetworkRequestFn;
    expect(mask({ name: "https://app.homi.uz/bff/listings?city=x#y" }).name).toBe("https://app.homi.uz/bff/listings");
  });

  it("before_send keeps origin and path of addresses and scrubs nested values; replay snapshots stay as they are", () => {
    const origin = window.location.origin;
    const event = beforeSend({
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url: `${origin}/ru/map?polygon=1,2#tgWebAppData=x`,
        $referrer: "https://web.telegram.org/k/?a=1",
        link: `${origin}/ru/listing/5?from=radar`,
        nested: { phone: "+998901234567", list: ["x@y.uz"] },
        $set_once: { $initial_current_url: `${origin}/ru?city=x` },
      },
    } as never);

    expect(event?.properties).toEqual({
      $current_url: `${origin}/ru/map`,
      $referrer: "https://web.telegram.org/k/",
      link: `${origin}/ru/listing/5`,
      nested: { phone: "+998***", list: ["***@***"] },
      $set_once: { $initial_current_url: `${origin}/ru` },
    });
    const heatmap = beforeSend({
      uuid: "h",
      event: "$$heatmap",
      properties: {
        $heatmap_data: { [`${origin}/ru/map?polygon=1,2&city=x`]: [{ x: 1, y: 2 }] },
        $web_vitals_LCP_event: { $current_url: `${origin}/ru?rooms_min=2#frag`, value: 1200 },
      },
    } as never);
    expect(heatmap?.properties).toEqual({
      $heatmap_data: { [`${origin}/ru/map`]: [{ x: 1, y: 2 }] },
      $web_vitals_LCP_event: { $current_url: `${origin}/ru`, value: 1200 },
    });
    // Heatmap points of two addresses that differ only in the query are merged; PostHog's ids pass as they are.
    const merged = beforeSend({
      uuid: "m",
      event: "$$heatmap",
      properties: {
        distinct_id: "c362c406-9360-4676-8a0b-1f2e3d4c5b6a",
        $heatmap_data: { [`${origin}/ru/map?rooms=1`]: [{ x: 1 }], [`${origin}/ru/map?rooms=2`]: [{ x: 2 }] },
      },
    } as never);
    expect(merged?.properties).toEqual({ distinct_id: "c362c406-9360-4676-8a0b-1f2e3d4c5b6a", $heatmap_data: { [`${origin}/ru/map`]: [{ x: 1 }, { x: 2 }] } });
    const snapshot = { uuid: "s", event: "$snapshot", properties: { $snapshot_data: [{ text: "+998901234567" }] } } as never;
    expect(beforeSend(snapshot)).toBe(snapshot);
  });
});
