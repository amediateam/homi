import { defaultFilters, filtersHash, type SearchFilters } from "@homi/search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false }) }));

import { CLOSE_QUIET_MS, NUDGE_COOLDOWN_MS, RETURN_AWAY_MS, RETURN_DELAY_MS, RETURN_REPEAT_MS } from "@/features/nudges/constants";
import { newCount, type ReturnRuleInput, shouldCheckReturn } from "@/features/nudges/returnRules";
import { emptyNudgeState, markFollowShown, markReturnShown, readNudgeState, resetNudgeMemory } from "@/features/nudges/storage";
import { getNudgeSlot, type NudgeEnv, resetNudgeSlot, slotTicket, takeSlot } from "@/features/nudges/store";
import { createReturnNudge, type ReturnNudge } from "@/features/nudges/useReturnNudge";
import { normalizeRadar, type Radar } from "@/features/radars/normalize";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DEFAULT: SearchFilters = defaultFilters("rent_long", "tashkent");
/** Two-room long-term rent in Tashkent: a custom search. */
const CUSTOM: SearchFilters = { ...DEFAULT, rooms_min: 2, rooms_max: 2 };
const OTHER: SearchFilters = { ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: 3 };

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";

function radarOf(id: string, filters: unknown, active = true): Radar {
  return normalizeRadar({ id, active, mode: "instant", hidden: 0, created_at: null, filters })!;
}

function rules(overrides: Partial<ReturnRuleInput> = {}): boolean {
  return shouldCheckReturn({
    filters: CUSTOM,
    previous: NOW - RETURN_AWAY_MS,
    radars: [],
    limit: 10,
    radarsEnabled: true,
    state: readNudgeState(),
    now: NOW,
    ...overrides,
  });
}

const events = () => recentTracked().map((event) => ({ name: event.name, props: event.props }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetNudgeMemory();
  resetNudgeSlot();
  clearTracked();
});

afterEach(() => {
  resetNudgeSlot();
  vi.useRealTimers();
  localStorage.clear();
});

describe("shouldCheckReturn (SCR-046 step 2, BR-APP-071)", () => {
  it("checks a search last visited at least 6 h ago, with no radar for it, under the limit, outside every cooldown", () => {
    expect(rules()).toBe(true);
    expect(rules({ filters: DEFAULT })).toBe(true);
  });

  it("never while radars are switched off (DEC-51)", () => {
    expect(rules({ radarsEnabled: false })).toBe(false);
  });

  it("not when a radar, on or paused, has the same filters", () => {
    expect(rules({ radars: [radarOf(A, CUSTOM)] })).toBe(false);
    expect(rules({ radars: [radarOf(A, { ...CUSTOM, posted_days: 7 }, false)] })).toBe(false);
    expect(rules({ radars: [radarOf(A, OTHER)] })).toBe(true);
  });

  it("default filters: not when any radar has the same base deal in the same city; daily rent counts as rent", () => {
    expect(rules({ filters: DEFAULT, radars: [radarOf(A, CUSTOM, false)] })).toBe(false);
    expect(rules({ filters: DEFAULT, radars: [radarOf(A, defaultFilters("rent_daily", "tashkent"))] })).toBe(false);
    expect(rules({ filters: DEFAULT, radars: [radarOf(A, OTHER)] })).toBe(true);
    expect(rules({ filters: DEFAULT, radars: [radarOf(A, { ...CUSTOM, city: "samarkand" })] })).toBe(true);
    expect(rules({ filters: CUSTOM, radars: [radarOf(A, DEFAULT)] })).toBe(true);
  });

  it("not at the radar limit", () => {
    const two = [radarOf(A, OTHER), radarOf(B, { ...OTHER, rooms_min: 1, rooms_max: 1 })];
    expect(rules({ radars: two, limit: 2 })).toBe(false);
    expect(rules({ radars: two, limit: 3 })).toBe(true);
  });

  it("the previous visit at least 6 h ago: 5 h 59 min is too soon, a first visit never", () => {
    expect(rules({ previous: NOW - (6 * HOUR - MINUTE) })).toBe(false);
    expect(rules({ previous: NOW - 6 * HOUR })).toBe(true);
    expect(rules({ previous: null })).toBe(false);
  });

  it("not while three closes silence the nudges (14 days)", () => {
    const state = { ...emptyNudgeState(), quietUntil: NOW + 1 };
    expect(rules({ state })).toBe(false);
    expect(rules({ state, now: NOW + 1, previous: NOW + 1 - RETURN_AWAY_MS })).toBe(true);
    expect(CLOSE_QUIET_MS).toBe(14 * DAY);
  });

  it("not within 8 h of the last shown nudge, the follow nudge's included (shared cooldown)", () => {
    markFollowShown(filtersHash(OTHER), NOW - NUDGE_COOLDOWN_MS + 1);
    expect(rules()).toBe(false);
    markFollowShown(filtersHash(OTHER), NOW - NUDGE_COOLDOWN_MS);
    expect(rules()).toBe(true);
  });

  it("once per filter set per 2 days: a banner 1 day ago blocks, 2 days ago does not", () => {
    markReturnShown(filtersHash(CUSTOM), NOW - DAY);
    expect(rules({ state: { ...readNudgeState(), lastShown: 0 } })).toBe(false);
    expect(rules({ filters: OTHER, state: { ...readNudgeState(), lastShown: 0 } })).toBe(true);
    markReturnShown(filtersHash(CUSTOM), NOW - RETURN_REPEAT_MS);
    expect(rules({ state: { ...readNudgeState(), lastShown: 0 } })).toBe(true);
  });
});

describe("newCount: only a positive integer shows the banner (LB-APP-048)", () => {
  it("1 and 12 show", () => {
    expect(newCount({ count: 1 })).toBe(1);
    expect(newCount({ count: 12 })).toBe(12);
  });

  it('0, "12", null, 1.5, a missing count and broken answers show nothing and never throw', () => {
    for (const data of [{ count: 0 }, { count: "12" }, { count: null }, { count: 1.5 }, {}, { count: -3 }, { count: Number.NaN }, { count: Infinity }]) {
      expect(newCount(data)).toBeNull();
    }
    for (const data of [null, undefined, "12", 12, [12]]) {
      expect(() => newCount(data)).not.toThrow();
      expect(newCount(data)).toBeNull();
    }
  });
});

/** One `GET /listings/new` the controller asked for; the test answers it when it wants. */
interface Asked {
  filters: SearchFilters;
  since: number;
  signal: AbortSignal;
  resolve: (count: number | null) => void;
  reject: (error: unknown) => void;
}

describe("createReturnNudge: the timing of the check (SCR-046 steps 1–5)", () => {
  let asked: Asked[];
  let back: ReturnNudge;
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

  const visit = (filters: SearchFilters, previous: number | null = NOW - 7 * HOUR) => back.visit({ filters, hash: filtersHash(filters), previous });

  async function flush() {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  }

  /** Answers the last request with `count`. */
  async function answer(count: number | null) {
    asked.at(-1)!.resolve(count);
    await flush();
  }

  beforeEach(() => {
    asked = [];
    back = createReturnNudge({
      fetchNew: (filters, since, signal) =>
        new Promise<number | null>((resolve, reject) => {
          asked.push({ filters, since, signal, resolve, reject });
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    });
    disconnect = back.connect();
    back.sync(envOf());
  });

  afterEach(() => {
    disconnect();
  });

  it("after a due visit on the feed list: returnPending, the 1 800 ms, then the request with since in whole seconds", async () => {
    visit(CUSTOM, NOW - 7 * HOUR + 789);
    expect(getNudgeSlot().returnPending).toBe(filtersHash(CUSTOM));
    vi.advanceTimersByTime(RETURN_DELAY_MS - 1);
    expect(asked).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(asked).toHaveLength(1);
    expect(asked[0].filters).toEqual(CUSTOM);
    expect(asked[0].since).toBe(Math.floor((NOW - 7 * HOUR + 789) / 1000));
    expect(asked[0].signal).toBeInstanceOf(AbortSignal);

    await answer(12);
    expect(back.view()).toMatchObject({ filters: CUSTOM, count: 12 });
    expect(getNudgeSlot()).toEqual({ active: "return", followPending: false, returnPending: null });
  });

  it("radars switched off: nothing waits and nothing is requested", () => {
    back.sync(envOf({ radarsEnabled: false }));
    visit(CUSTOM);
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("a first visit, or one 5 h 59 min after the last, holds nothing back (no returnPending) and asks nothing", () => {
    visit(CUSTOM, null);
    expect(getNudgeSlot().returnPending).toBeNull();
    visit(CUSTOM, NOW - (6 * HOUR - MINUTE));
    expect(getNudgeSlot().returnPending).toBeNull();
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
  });

  it("waits for the radar list, then follows its rules: a radar for the search stops it", () => {
    back.sync(envOf({ radars: undefined }));
    visit(CUSTOM);
    expect(getNudgeSlot().returnPending).toBeNull();
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);

    back.sync(envOf({ radars: [radarOf(A, CUSTOM, false)] }));
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
    expect(getNudgeSlot().returnPending).toBeNull();

    back.sync(envOf({ filters: OTHER, radars: [radarOf(A, CUSTOM, false)] }));
    visit(OTHER);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    expect(asked.map((request) => request.filters)).toEqual([OTHER]);
  });

  it("waits for the reference data", () => {
    back.sync(envOf({ referenceLoaded: false }));
    visit(CUSTOM);
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
    back.sync(envOf());
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    expect(asked).toHaveLength(1);
  });

  it("a filter change during the wait or the request aborts it and clears returnPending", async () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS - 1);
    back.sync(envOf({ filters: OTHER }));
    expect(getNudgeSlot().returnPending).toBeNull();
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);

    back.sync(envOf());
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    back.sync(envOf({ filters: OTHER }));
    expect(asked[0].signal.aborted).toBe(true);
    expect(getNudgeSlot().returnPending).toBeNull();
    asked[0].resolve(12);
    await flush();
    expect(back.view()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();
  });

  it("a change of the radar list aborts it; a re-read of the same list does not", () => {
    back.sync(envOf({ radars: [radarOf(A, OTHER)] }));
    visit(CUSTOM);
    back.sync(envOf({ radars: [radarOf(A, OTHER)] }));
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    expect(asked).toHaveLength(1);
    expect(asked[0].signal.aborted).toBe(false);

    back.sync(envOf({ radars: [radarOf(A, OTHER, false)] }));
    expect(asked[0].signal.aborted).toBe(true);
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("a layer that opens aborts it, and closing the layer does not bring it back", () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    back.sync(envOf({ allowed: false, layer: true, filters: null }));
    expect(asked[0].signal.aborted).toBe(true);
    back.sync(envOf());
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(1);
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("a visit recorded under a layer waits for it to close, then the 1 800 ms and the request", () => {
    back.sync(envOf({ allowed: false, layer: true, filters: null }));
    visit(CUSTOM);
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
    expect(getNudgeSlot().returnPending).toBeNull();

    back.sync(envOf({ allowed: false, layer: true }));
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);

    back.sync(envOf());
    expect(getNudgeSlot().returnPending).toBe(filtersHash(CUSTOM));
    vi.advanceTimersByTime(RETURN_DELAY_MS - 1);
    expect(asked).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(asked.map((request) => request.filters)).toEqual([CUSTOM]);
  });

  it("a visit recorded under a layer is still dropped by another search, another tab or a radar-list change", () => {
    back.sync(envOf({ allowed: false, layer: true, filters: null }));
    visit(CUSTOM);
    back.sync(envOf({ allowed: false, layer: true, filters: OTHER }));
    back.sync(envOf());
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);

    back.sync(envOf({ allowed: false, layer: true, filters: null }));
    visit(CUSTOM);
    back.sync(envOf({ allowed: false, filters: null }));
    back.sync(envOf());
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);

    back.sync(envOf({ allowed: false, layer: true, filters: null }));
    visit(CUSTOM);
    back.sync(envOf({ allowed: false, layer: true, filters: null, radars: [radarOf(A, OTHER)] }));
    back.sync(envOf({ radars: [radarOf(A, OTHER)] }));
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("the map pauses it; the list starts the 1 800 ms afresh", () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS - 1);
    back.sync(envOf({ allowed: false }));
    expect(getNudgeSlot().returnPending).toBeNull();
    vi.advanceTimersByTime(10 * RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
    back.sync(envOf());
    expect(getNudgeSlot().returnPending).toBe(filtersHash(CUSTOM));
    vi.advanceTimersByTime(RETURN_DELAY_MS - 1);
    expect(asked).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(asked).toHaveLength(1);
  });

  it("an answer without a positive count, or a failed read, ends the check without a banner", async () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    await answer(null);
    expect(back.view()).toBeNull();
    expect(getNudgeSlot()).toEqual({ active: null, followPending: false, returnPending: null });

    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    asked.at(-1)!.reject(new TypeError("Failed to fetch"));
    await flush();
    expect(back.view()).toBeNull();
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("the rules are asked again after the wait: a nudge shown meanwhile stops it", () => {
    visit(CUSTOM);
    markFollowShown(filtersHash(OTHER), NOW + 1000);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    expect(asked).toHaveLength(0);
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("a toast holds the banner back; it takes the slot once the toast is gone", async () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    back.sync(envOf({ toast: true }));
    await answer(3);
    expect(back.view()).toBeNull();
    expect(getNudgeSlot().returnPending).toBe(filtersHash(CUSTOM));
    back.sync(envOf());
    expect(back.view()).toMatchObject({ count: 3 });
  });

  it("takes the slot from a follow nudge and from a home offer", async () => {
    takeSlot("follow");
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    await answer(5);
    expect(getNudgeSlot().active).toBe("return");
    expect(slotTicket("follow")).toBeNull();
    expect(takeSlot("follow")).toBeNull();
    expect(takeSlot("home")).toBeNull();
  });

  it("a filter change ends the banner without an event; a visit of its own search changes nothing", async () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    await answer(5);
    const shown = back.view();
    visit(CUSTOM);
    expect(back.view()).toBe(shown);
    expect(getNudgeSlot().returnPending).toBeNull();

    back.sync(envOf({ filters: OTHER }));
    expect(back.view()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();
    expect(events()).toEqual([]);
  });

  it("a toast or another address only suspends the banner; switching radars off ends it", async () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    await answer(5);
    back.sync(envOf({ toast: true }));
    back.sync(envOf({ allowed: false, layer: true, filters: null }));
    expect(back.view()).not.toBeNull();
    back.sync(envOf({ radarsEnabled: false }));
    expect(back.view()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();
  });

  it("the marks of the first render, the 15 s and ×: back[hash], lastShown, asked, the events, the shared streak", async () => {
    back.sync(envOf({ filters: DEFAULT }));
    visit(DEFAULT);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    await answer(12);
    vi.setSystemTime(NOW + 5000);
    back.markShown();
    expect(readNudgeState()).toMatchObject({ asked: [filtersHash(DEFAULT)], lastShown: NOW + 5000, back: { [filtersHash(DEFAULT)]: NOW + 5000 } });
    expect(events()).toEqual([{ name: "return_prompt_shown", props: { n: 12, custom: false } }]);

    back.close();
    expect(readNudgeState().closed).toBe(1);
    expect(back.view()).toBeNull();
    expect(events().at(-1)).toEqual({ name: "return_prompt_closed", props: { custom: false } });
    back.expire();
    expect(events()).toHaveLength(2);
  });

  it("a dropped candidate leaves no trace: no cooldown, no hash, no event (LB-APP-050)", async () => {
    visit(CUSTOM);
    vi.advanceTimersByTime(RETURN_DELAY_MS);
    back.sync(envOf({ filters: OTHER }));
    asked[0].resolve(9);
    await flush();
    expect(readNudgeState()).toEqual(emptyNudgeState());
    expect(events()).toEqual([]);
  });
});
