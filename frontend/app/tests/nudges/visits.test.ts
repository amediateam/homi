import { defaultFilters, filtersHash, type SearchFilters } from "@homi/search";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VISITS_KEEP } from "@/features/nudges/constants";
import {
  previousVisit,
  readVisits,
  recordVisit,
  resetVisitSession,
  type SearchVisit,
  useSearchVisits,
  type VisitInput,
} from "@/features/nudges/visits";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const DEFAULT: SearchFilters = defaultFilters("rent_long", "tashkent");
const CUSTOM: SearchFilters = { ...DEFAULT, rooms_min: 2, rooms_max: 2 };
const OTHER: SearchFilters = { ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: 3 };

const stored = (): Record<string, number> => JSON.parse(localStorage.getItem("homi-visits") ?? "{}") as Record<string, number>;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetVisitSession();
});

afterEach(() => {
  cleanup();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  vi.useRealTimers();
  localStorage.clear();
});

describe("recordVisit (BR-APP-070)", () => {
  it("stores the time of the visit per filter hash; a first visit has no previous one", () => {
    expect(recordVisit(CUSTOM)).toBeNull();
    expect(stored()).toEqual({ [filtersHash(CUSTOM)]: NOW });
  });

  it("the previous visit is the stored time read at the first visit of the session, while the stored time moves on", () => {
    localStorage.setItem("homi-visits", JSON.stringify({ [filtersHash(CUSTOM)]: NOW - 7 * HOUR }));
    expect(recordVisit(CUSTOM)).toBe(NOW - 7 * HOUR);
    vi.setSystemTime(NOW + HOUR);
    expect(recordVisit(CUSTOM)).toBe(NOW - 7 * HOUR);
    expect(previousVisit(CUSTOM)).toBe(NOW - 7 * HOUR);
    expect(stored()[filtersHash(CUSTOM)]).toBe(NOW + HOUR);

    resetVisitSession();
    expect(previousVisit(CUSTOM)).toBeNull();
    expect(recordVisit(CUSTOM, NOW + 2 * HOUR)).toBe(NOW + HOUR);
  });

  it("a filter set first seen in the session without a stored time keeps null as its previous visit", () => {
    expect(recordVisit(OTHER, NOW)).toBeNull();
    expect(recordVisit(OTHER, NOW + 8 * HOUR)).toBeNull();
  });

  it("keeps the 40 newest", () => {
    for (let index = 0; index <= VISITS_KEEP; index += 1) {
      recordVisit({ ...DEFAULT, price_max: 100 + index }, NOW + index);
    }
    const visits = stored();
    expect(Object.keys(visits)).toHaveLength(VISITS_KEEP);
    expect(visits[filtersHash({ ...DEFAULT, price_max: 100 })]).toBeUndefined();
    expect(visits[filtersHash({ ...DEFAULT, price_max: 100 + VISITS_KEEP })]).toBe(NOW + VISITS_KEEP);
  });

  it("posted_days does not change the hash", () => {
    recordVisit(CUSTOM, NOW - 7 * HOUR);
    resetVisitSession();
    expect(recordVisit({ ...CUSTOM, posted_days: 7 })).toBe(NOW - 7 * HOUR);
    expect(Object.keys(stored())).toEqual([filtersHash(CUSTOM)]);
  });

  it("a broken value reads as empty and is replaced by the next visit", () => {
    for (const broken of ["not json", "[1,2]", '"text"', "null", "42"]) {
      localStorage.setItem("homi-visits", broken);
      expect(readVisits()).toEqual({});
    }
    localStorage.setItem("homi-visits", JSON.stringify({ a: "yesterday", b: 5, c: null }));
    expect(readVisits()).toEqual({ b: 5 });
    localStorage.setItem("homi-visits", "{");
    expect(recordVisit(CUSTOM)).toBeNull();
    expect(stored()).toEqual({ [filtersHash(CUSTOM)]: NOW });
  });
});

describe("useSearchVisits: when a visit is recorded (BR-APP-070, TMA-040)", () => {
  const onVisit = vi.fn<(visit: SearchVisit) => void>();
  const onSession = vi.fn<() => void>();

  function track(input: VisitInput) {
    return renderHook((props: VisitInput) => useSearchVisits(props, { onVisit, onSession }), { initialProps: input });
  }

  const visits = () => onVisit.mock.calls.map(([visit]) => visit);

  beforeEach(() => {
    onVisit.mockReset();
    onSession.mockReset();
  });

  it("none before the reference data is loaded and the session is ready; then the search on screen", () => {
    const view = track({ searchTab: true, filters: CUSTOM, ready: false });
    expect(visits()).toEqual([]);
    expect(localStorage.getItem("homi-visits")).toBeNull();

    view.rerender({ searchTab: true, filters: CUSTOM, ready: true });
    expect(visits()).toEqual([{ filters: CUSTOM, hash: filtersHash(CUSTOM), previous: null }]);
    expect(stored()).toEqual({ [filtersHash(CUSTOM)]: NOW });
  });

  it("on entering the search tab: the launch on it, and each return from another tab", () => {
    const view = track({ searchTab: true, filters: CUSTOM, ready: true });
    view.rerender({ searchTab: false, filters: null, ready: true });
    vi.setSystemTime(NOW + MINUTE);
    view.rerender({ searchTab: true, filters: CUSTOM, ready: true });
    expect(visits().map((visit) => visit.hash)).toEqual([filtersHash(CUSTOM), filtersHash(CUSTOM)]);
    expect(stored()[filtersHash(CUSTOM)]).toBe(NOW + MINUTE);
    expect(visits()[1].previous).toBeNull();
  });

  it("on every filter change, the map included; the list ↔ map toggle, a re-render and a layer over the search are none", () => {
    const view = track({ searchTab: true, filters: DEFAULT, ready: true });
    view.rerender({ searchTab: true, filters: { ...DEFAULT }, ready: true });
    view.rerender({ searchTab: true, filters: null, ready: true });
    view.rerender({ searchTab: true, filters: DEFAULT, ready: true });
    expect(visits()).toHaveLength(1);

    view.rerender({ searchTab: true, filters: CUSTOM, ready: true });
    view.rerender({ searchTab: true, filters: OTHER, ready: true });
    view.rerender({ searchTab: true, filters: { ...OTHER, posted_days: 3 }, ready: true });
    expect(visits().map((visit) => visit.filters)).toEqual([DEFAULT, CUSTOM, OTHER]);
  });

  it("on going to the background while on the search tab: the stored time becomes that moment, without a cue", () => {
    const view = track({ searchTab: true, filters: CUSTOM, ready: true });
    vi.setSystemTime(NOW + 20 * MINUTE);
    setVisibility("hidden");
    expect(stored()[filtersHash(CUSTOM)]).toBe(NOW + 20 * MINUTE);
    expect(visits()).toHaveLength(1);

    view.rerender({ searchTab: false, filters: null, ready: true });
    vi.setSystemTime(NOW + 40 * MINUTE);
    setVisibility("visible");
    setVisibility("hidden");
    expect(stored()[filtersHash(CUSTOM)]).toBe(NOW + 20 * MINUTE);
  });

  it("visible again after 5 h 59 min keeps the session; after 6 h a new one re-reads the radars and records the visit again", () => {
    localStorage.setItem("homi-visits", JSON.stringify({ [filtersHash(CUSTOM)]: NOW - 30 * HOUR }));
    track({ searchTab: true, filters: CUSTOM, ready: true });
    expect(visits()[0].previous).toBe(NOW - 30 * HOUR);

    setVisibility("hidden");
    vi.setSystemTime(NOW + 6 * HOUR - MINUTE);
    setVisibility("visible");
    expect(onSession).not.toHaveBeenCalled();
    expect(visits()).toHaveLength(1);

    vi.setSystemTime(NOW + 6 * HOUR + 5 * MINUTE);
    setVisibility("hidden");
    vi.setSystemTime(NOW + 12 * HOUR + 5 * MINUTE);
    setVisibility("visible");
    expect(onSession).toHaveBeenCalledTimes(1);
    expect(visits()).toHaveLength(2);
    expect(visits()[1]).toEqual({ filters: CUSTOM, hash: filtersHash(CUSTOM), previous: NOW + 6 * HOUR + 5 * MINUTE });
    expect(stored()[filtersHash(CUSTOM)]).toBe(NOW + 12 * HOUR + 5 * MINUTE);

    setVisibility("visible");
    expect(onSession).toHaveBeenCalledTimes(1);
  });

  it("a new session off the search tab re-reads the radars and records nothing", () => {
    const view = track({ searchTab: false, filters: null, ready: true });
    setVisibility("hidden");
    vi.setSystemTime(NOW + 6 * HOUR);
    setVisibility("visible");
    expect(onSession).toHaveBeenCalledTimes(1);
    expect(visits()).toEqual([]);

    view.rerender({ searchTab: true, filters: DEFAULT, ready: true });
    expect(visits()).toHaveLength(1);
  });

  it("stops listening when the host goes", () => {
    const view = track({ searchTab: true, filters: CUSTOM, ready: true });
    view.unmount();
    setVisibility("hidden");
    vi.setSystemTime(NOW + 7 * HOUR);
    setVisibility("visible");
    expect(onSession).not.toHaveBeenCalled();
    expect(stored()[filtersHash(CUSTOM)]).toBe(NOW);
  });
});
