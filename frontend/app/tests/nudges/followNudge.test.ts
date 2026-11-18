import { defaultFilters, filtersHash, type SearchFilters } from "@homi/search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false }) }));

import type { LiveFlow } from "@/features/filters/flow";
import {
  ASKED_KEEP,
  BACK_KEEP,
  CLOSE_QUIET_MS,
  FOLLOW_DELAY_MS,
  NUDGE_COOLDOWN_MS,
} from "@/features/nudges/constants";
import { type FollowRuleInput, shouldShowFollowNudge } from "@/features/nudges/followRules";
import {
  emptyNudgeState,
  markFollowShown,
  markNudgeClosed,
  markReturnShown,
  readNudgeState,
  resetNudgeCloses,
  resetNudgeMemory,
  snoozeFeedRadar,
} from "@/features/nudges/storage";
import { getNudgeSlot, type NudgeEnv, resetNudgeSlot, setReturnPending, takeSlot } from "@/features/nudges/store";
import { createFollowNudge, type FollowNudge } from "@/features/nudges/useFollowNudge";
import { normalizeRadar, type Radar } from "@/features/radars/normalize";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const HOUR = 60 * 60 * 1000;

/** Two-room long-term rent in Tashkent: a custom search. */
const CUSTOM: SearchFilters = { ...defaultFilters("rent_long", "tashkent"), rooms_min: 2, rooms_max: 2 };
/** Sale of three rooms in Tashkent: another custom search. */
const OTHER: SearchFilters = { ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: 3 };

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";

function radarOf(id: string, filters: unknown, active = true): Radar {
  return normalizeRadar({ id, active, mode: "instant", hidden: 0, created_at: null, filters })!;
}

function rules(overrides: Partial<FollowRuleInput> = {}): boolean {
  return shouldShowFollowNudge({
    filters: CUSTOM,
    radars: [],
    limit: 10,
    radarsEnabled: true,
    state: readNudgeState(),
    now: Date.now(),
    ...overrides,
  });
}

const events = () => recentTracked().map((event) => event.name);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetNudgeMemory();
  resetNudgeSlot();
  clearTracked();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("shouldShowFollowNudge (SCR-040 step 3, BR-APP-043)", () => {
  it("offers custom filters with no radar, under the limit, outside every cooldown", () => {
    expect(rules()).toBe(true);
    expect(rules({ filters: { ...defaultFilters("rent_daily", "tashkent") } })).toBe(true);
  });

  it("never while radars are switched off (DEC-51)", () => {
    expect(rules({ radarsEnabled: false })).toBe(false);
  });

  it("never for default filters (BR-APP-013)", () => {
    expect(rules({ filters: defaultFilters("rent_long", "tashkent") })).toBe(false);
    expect(rules({ filters: defaultFilters("sale", "samarkand") })).toBe(false);
  });

  it("not when a radar, on or paused, has the same filters; a radar of other filters does not count", () => {
    expect(rules({ radars: [radarOf(A, CUSTOM)] })).toBe(false);
    expect(rules({ radars: [radarOf(A, CUSTOM, false)] })).toBe(false);
    expect(rules({ radars: [radarOf(A, { ...CUSTOM, posted_days: 7 })] })).toBe(false);
    expect(rules({ radars: [radarOf(A, OTHER)] })).toBe(true);
    expect(rules({ radars: undefined })).toBe(true);
  });

  it("not at the radar limit", () => {
    const two = [radarOf(A, OTHER), radarOf(B, { ...OTHER, rooms_min: 1, rooms_max: 1 })];
    expect(rules({ radars: two, limit: 2 })).toBe(false);
    expect(rules({ radars: two, limit: 3 })).toBe(true);
  });

  it("not within 8 h of the last shown nudge", () => {
    markFollowShown(filtersHash(OTHER), NOW);
    expect(rules({ now: NOW + NUDGE_COOLDOWN_MS - 1 })).toBe(false);
    expect(rules({ now: NOW + NUDGE_COOLDOWN_MS })).toBe(true);
  });

  it("three closes in a row silence it for 14 days, and the streak starts again", () => {
    markNudgeClosed(NOW);
    markNudgeClosed(NOW);
    expect(readNudgeState()).toMatchObject({ closed: 2, quietUntil: 0 });
    expect(rules()).toBe(true);
    markNudgeClosed(NOW);
    expect(readNudgeState()).toMatchObject({ closed: 0, quietUntil: NOW + CLOSE_QUIET_MS });
    expect(rules({ now: NOW + CLOSE_QUIET_MS - 1 })).toBe(false);
    expect(rules({ now: NOW + CLOSE_QUIET_MS })).toBe(true);
  });

  it("«Включить» resets the streak, so two more closes do not silence it", () => {
    markNudgeClosed(NOW);
    markNudgeClosed(NOW);
    resetNudgeCloses();
    markNudgeClosed(NOW);
    markNudgeClosed(NOW);
    expect(readNudgeState()).toMatchObject({ closed: 2, quietUntil: 0 });
  });

  it("never twice for the same filters; the hash is stable for equal filters", () => {
    markFollowShown(filtersHash(CUSTOM), NOW - NUDGE_COOLDOWN_MS);
    expect(rules()).toBe(false);
    expect(rules({ filters: { ...CUSTOM, posted_days: 3 } })).toBe(false);
    expect(rules({ filters: { ...CUSTOM, districts: [] } })).toBe(false);
    expect(rules({ filters: OTHER })).toBe(true);
    expect(filtersHash({ ...CUSTOM, types: ["house", "apartment"] })).toBe(filtersHash({ ...CUSTOM, types: ["apartment", "house"] }));
  });

  it("keeps the 40 newest hashes, newest first: the oldest can be offered again", () => {
    const hashes = Array.from({ length: ASKED_KEEP + 1 }, (_, index) => `h${index}`);
    for (const hash of hashes) {
      markFollowShown(hash, NOW - NUDGE_COOLDOWN_MS);
    }
    const { asked } = readNudgeState();
    expect(asked).toHaveLength(ASKED_KEEP);
    expect(asked[0]).toBe(`h${ASKED_KEEP}`);
    expect(asked).not.toContain("h0");
    markFollowShown("h5", NOW - NUDGE_COOLDOWN_MS);
    expect(readNudgeState().asked.filter((hash) => hash === "h5")).toEqual(["h5"]);
    expect(readNudgeState().asked[0]).toBe("h5");
  });

  it("a shown return banner starts its cooldown and marks its hash (BR-APP-043)", () => {
    markReturnShown(filtersHash(CUSTOM), NOW);
    expect(readNudgeState()).toMatchObject({ lastShown: NOW, asked: [filtersHash(CUSTOM)], back: { [filtersHash(CUSTOM)]: NOW } });
    expect(rules({ filters: OTHER })).toBe(false);
    expect(rules({ filters: OTHER, now: NOW + NUDGE_COOLDOWN_MS })).toBe(true);
    expect(rules({ now: NOW + NUDGE_COOLDOWN_MS })).toBe(false);
  });
});

describe("homi-nudge (storage)", () => {
  it("reads a broken value as the default, and so a missing one", () => {
    for (const raw of ["{", "null", "[]", '"text"', '{"asked":"x","closed":2}', '{"closed":2}']) {
      localStorage.setItem("homi-nudge", raw);
      expect(readNudgeState()).toEqual(emptyNudgeState());
      expect(rules()).toBe(true);
    }
    localStorage.removeItem("homi-nudge");
    expect(readNudgeState()).toEqual(emptyNudgeState());
  });

  it("takes each well-formed field and defaults the others", () => {
    localStorage.setItem(
      "homi-nudge",
      JSON.stringify({ asked: ["a", 3, "b"], closed: "2", quietUntil: 5, lastShown: Number.NaN, back: { a: 1, b: "x" }, feedOff: 9 }),
    );
    expect(readNudgeState()).toEqual({ asked: ["a", "b"], closed: 0, quietUntil: 5, lastShown: 0, back: { a: 1 }, feedOff: 9 });
  });

  it("reads a value the legacy client wrote with the same hash for the same filters", () => {
    localStorage.setItem("homi-nudge", JSON.stringify({ asked: [filtersHash(CUSTOM)], closed: 1, quietUntil: 0 }));
    expect(readNudgeState()).toMatchObject({ asked: [filtersHash(CUSTOM)], closed: 1, lastShown: 0, back: {}, feedOff: 0 });
    expect(rules()).toBe(false);
  });

  it("keeps the 40 newest banner times; the radar card's snooze is 7 days", () => {
    for (let index = 0; index <= BACK_KEEP; index += 1) {
      markReturnShown(`h${index}`, NOW + index);
    }
    const { back } = readNudgeState();
    expect(Object.keys(back)).toHaveLength(BACK_KEEP);
    expect(back.h0).toBeUndefined();
    expect(back[`h${BACK_KEEP}`]).toBe(NOW + BACK_KEEP);
    snoozeFeedRadar(NOW);
    expect(readNudgeState().feedOff).toBe(NOW + 7 * 24 * HOUR);
    expect(readNudgeState().closed).toBe(0);
  });

  it("keeps the state in memory for the launch when the store refuses it (KV-FE-080)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    markFollowShown(filtersHash(CUSTOM), NOW);
    expect(localStorage.getItem("homi-nudge")).toBeNull();
    expect(readNudgeState()).toMatchObject({ asked: [filtersHash(CUSTOM)], lastShown: NOW });
    expect(rules({ now: NOW + NUDGE_COOLDOWN_MS })).toBe(false);
  });
});

/** One `GET /listings/flow` the nudge sent; the test answers it. */
interface Sent {
  filters: SearchFilters;
  signal: AbortSignal;
  resolve: (flow: LiveFlow | null) => void;
  reject: (error: unknown) => void;
}

describe("createFollowNudge (SCR-040 steps 1–5)", () => {
  let sent: Sent[];
  let nudge: FollowNudge;
  let disconnect: () => void;

  const envOf = (overrides: Partial<NudgeEnv> = {}): NudgeEnv => ({
    allowed: true,
    layer: false,
    filters: CUSTOM,
    toast: false,
    radars: [],
    radarsEnabled: true,
    limit: 10,
    referenceLoaded: true,
    ...overrides,
  });

  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  /** Answers the last request and lets the answer land. */
  const answer = async (flow: LiveFlow | null) => {
    sent.at(-1)!.resolve(flow);
    await settle();
  };

  beforeEach(() => {
    sent = [];
    nudge = createFollowNudge({
      fetchFlow: (filters, signal) =>
        new Promise<LiveFlow | null>((resolve, reject) => {
          sent.push({ filters, signal, resolve, reject });
        }),
    });
    disconnect = nudge.connect();
  });

  afterEach(() => {
    disconnect();
  });

  it("waits 1 800 ms on the feed list, then reads the flow and takes the slot", async () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    expect(getNudgeSlot().followPending).toBe(true);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS - 1);
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sent.map((request) => request.filters)).toEqual([CUSTOM]);
    expect(nudge.view()).toBeNull();

    await answer({ week: 3, days: 7, options: [] });
    expect(nudge.view()).toMatchObject({ filters: CUSTOM, flow: { week: 3, days: 7 } });
    expect(getNudgeSlot()).toEqual({ active: "follow", followPending: false, returnPending: null });
    expect(events()).toEqual([]);
    expect(readNudgeState()).toEqual(emptyNudgeState());
  });

  it("a failed or empty flow read still shows the nudge, without a flow line (LB-APP-006)", async () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    sent[0].reject(new Error("offline"));
    await settle();
    expect(nudge.view()).toMatchObject({ filters: CUSTOM, flow: null });
  });

  it("with radars switched off nothing is offered and no flow is requested (DEC-51)", () => {
    nudge.sync(envOf({ radarsEnabled: false }));
    nudge.offer(CUSTOM);
    expect(getNudgeSlot().followPending).toBe(false);
    vi.advanceTimersByTime(10 * FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(0);

    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    nudge.sync(envOf({ radarsEnabled: false }));
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(0);
    expect(getNudgeSlot().followPending).toBe(false);
  });

  it("default filters are never offered", () => {
    const filters = defaultFilters("rent_long", "tashkent");
    nudge.sync(envOf({ filters }));
    nudge.offer(filters);
    vi.advanceTimersByTime(10 * FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(0);
  });

  it("the address on its way — the sheet, then the previous search — is no filter change", () => {
    nudge.sync(envOf({ allowed: false, layer: true, filters: null }));
    nudge.offer(CUSTOM);
    nudge.sync(envOf({ filters: OTHER }));
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(0);
    expect(getNudgeSlot().followPending).toBe(true);

    nudge.sync(envOf());
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(1);
  });

  it("an apply overtaken by another tab before its filters were shown is dropped", () => {
    nudge.sync(envOf({ allowed: false, layer: true, filters: null }));
    nudge.offer(CUSTOM);
    nudge.sync(envOf({ allowed: false, filters: null }));
    expect(getNudgeSlot().followPending).toBe(false);
    nudge.sync(envOf());
    vi.advanceTimersByTime(10 * FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(0);
  });

  it("a filter change once the filters were shown drops the candidate without a trace", () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS - 1);
    nudge.sync(envOf({ filters: OTHER }));
    nudge.sync(envOf());
    vi.advanceTimersByTime(10 * FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(0);
    expect(getNudgeSlot().followPending).toBe(false);
    expect(readNudgeState()).toEqual(emptyNudgeState());
    expect(events()).toEqual([]);
  });

  it("a filter change during the flow request aborts it", async () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    nudge.sync(envOf({ filters: OTHER }));
    expect(sent[0].signal.aborted).toBe(true);
    await answer({ week: 3, days: 7, options: [] });
    expect(nudge.view()).toBeNull();
    expect(getNudgeSlot()).toEqual({ active: null, followPending: false, returnPending: null });
  });

  it("a layer that opens drops the candidate; another tab or the map only pauses the wait", () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(1000);
    nudge.sync(envOf({ allowed: false, filters: null }));
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(0);
    nudge.sync(envOf({ allowed: false }));
    nudge.sync(envOf());
    vi.advanceTimersByTime(FOLLOW_DELAY_MS - 1);
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(1);

    disconnect();
    disconnect = nudge.connect();
    nudge.sync(envOf());
    nudge.offer(OTHER);
    nudge.sync(envOf({ filters: OTHER }));
    nudge.sync(envOf({ allowed: false, layer: true, filters: null }));
    nudge.sync(envOf({ filters: OTHER }));
    vi.advanceTimersByTime(10 * FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(1);
    expect(getNudgeSlot().followPending).toBe(false);
  });

  it("a change of the radar list drops the candidate; a re-read of the same list does not", () => {
    const list = [radarOf(A, OTHER)];
    nudge.sync(envOf({ radars: list }));
    nudge.offer(CUSTOM);
    nudge.sync(envOf({ radars: [radarOf(A, OTHER)] }));
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(1);

    nudge.offer(CUSTOM);
    expect(getNudgeSlot().followPending).toBe(true);
    nudge.sync(envOf({ radars: [radarOf(A, OTHER, false)] }));
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(1);
    expect(getNudgeSlot().followPending).toBe(false);
  });

  it("the wait starts only without a toast, and afresh after one", () => {
    nudge.sync(envOf({ toast: true }));
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(3000);
    expect(sent).toHaveLength(0);
    nudge.sync(envOf());
    vi.advanceTimersByTime(1000);
    nudge.sync(envOf({ toast: true }));
    vi.advanceTimersByTime(3000);
    nudge.sync(envOf());
    vi.advanceTimersByTime(FOLLOW_DELAY_MS - 1);
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(1);
  });

  it("is not offered while a return check of the same filters is pending (BR-APP-046)", () => {
    setReturnPending(filtersHash(CUSTOM));
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(10 * FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(0);
    expect(getNudgeSlot().followPending).toBe(true);

    setReturnPending(filtersHash(OTHER));
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(sent).toHaveLength(1);
  });

  it("a return banner that takes the slot drops the candidate and aborts its request (BR-APP-071)", () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    takeSlot("return");
    expect(sent[0].signal.aborted).toBe(true);
    expect(getNudgeSlot()).toEqual({ active: "return", followPending: false, returnPending: null });
  });

  it("a ready nudge waits for the toast to go before it takes the slot", async () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    nudge.sync(envOf({ toast: true }));
    await answer(null);
    expect(nudge.view()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();
    nudge.sync(envOf());
    expect(nudge.view()).not.toBeNull();
    expect(getNudgeSlot().active).toBe("follow");
  });

  it("the marks run on markShown only: asked, lastShown and one follow_prompt_shown", async () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    await answer(null);
    expect(readNudgeState()).toEqual(emptyNudgeState());
    nudge.markShown();
    expect(readNudgeState()).toMatchObject({ asked: [filtersHash(CUSTOM)], lastShown: NOW + FOLLOW_DELAY_MS });
    expect(events()).toEqual(["follow_prompt_shown"]);
  });

  it("expire, close and enable end it with their effects; a filter change ends it without an event", async () => {
    const show = async (filters: SearchFilters) => {
      vi.setSystemTime(Date.now() + NUDGE_COOLDOWN_MS);
      nudge.sync(envOf({ filters }));
      nudge.offer(filters);
      vi.advanceTimersByTime(FOLLOW_DELAY_MS);
      await answer(null);
      nudge.markShown();
      expect(getNudgeSlot().active).toBe("follow");
    };

    await show(CUSTOM);
    nudge.expire();
    expect(nudge.view()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();

    await show(OTHER);
    nudge.close();
    expect(readNudgeState().closed).toBe(1);

    const third: SearchFilters = { ...CUSTOM, rooms_min: 1, rooms_max: 1 };
    await show(third);
    expect(nudge.enable()).toMatchObject({ filters: third });
    expect(readNudgeState().closed).toBe(0);
    expect(getNudgeSlot().active).toBeNull();

    const fourth: SearchFilters = { ...CUSTOM, rooms_min: 4, rooms_max: 4 };
    await show(fourth);
    nudge.sync(envOf({ filters: OTHER }));
    expect(nudge.view()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();
    expect(events()).toEqual([
      "follow_prompt_shown",
      "follow_prompt_expired",
      "follow_prompt_shown",
      "follow_prompt_closed",
      "follow_prompt_shown",
      "follow_prompt_shown",
    ]);
  });

  it("a new apply ends the nudge on screen without an event", async () => {
    nudge.sync(envOf());
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    await answer(null);
    nudge.markShown();
    nudge.offer(OTHER);
    expect(nudge.view()).toBeNull();
    expect(getNudgeSlot()).toMatchObject({ active: null });
    expect(events()).toEqual(["follow_prompt_shown"]);
  });
});
