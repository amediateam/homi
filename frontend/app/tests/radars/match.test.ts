import { defaultFilters, type SearchFilters } from "@homi/search";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";

/** One `bffFetch` the radar list sent; the test answers it when it wants. */
interface Sent {
  path: string;
  query: BffOptions["query"];
  resolve: (answer: ApiResult<unknown>) => void;
}

const state = vi.hoisted(() => ({ sent: [] as Sent[], status: "ready" as string }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) =>
    new Promise<ApiResult<unknown>>((resolve) => {
      state.sent.push({ path, query: options.query, resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, renewed: false }) }));

import { hasActiveRadar, hasRadarFor, hasSameRadar, useHasActiveRadar } from "@/features/radars/match";
import { normalizeRadar, type Radar } from "@/features/radars/normalize";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";

/** Two-room long-term rent in Tashkent, published within 7 days: a custom search. */
const SEARCH: SearchFilters = { ...defaultFilters("rent_long", "tashkent"), rooms_min: 2, rooms_max: 2, posted_days: 7 };

function radarOf(id: string, filters: unknown, active = true): Radar {
  return normalizeRadar({ id, active, mode: "instant", hidden: 0, created_at: null, filters })!;
}

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const raw = (id: string, filters: unknown, active = true) => ({ id, active, mode: "instant", hidden: 0, created_at: null, filters });

beforeEach(() => {
  state.sent.length = 0;
  state.status = "ready";
  resetResources();
  feedReference({ reference: { radars_enabled: true } });
});

afterEach(() => {
  cleanup();
  resetReference();
});

describe("hasSameRadar (follow nudge, BR-APP-043)", () => {
  it("any radar, on or paused, with the same filters; posted_days ignored", () => {
    expect(hasSameRadar(SEARCH, [radarOf(A, { ...SEARCH, posted_days: null })])).toBe(true);
    expect(hasSameRadar(SEARCH, [radarOf(A, SEARCH, false)])).toBe(true);
  });

  it("other filters, or no radar, do not count", () => {
    expect(hasSameRadar(SEARCH, [radarOf(A, { ...SEARCH, rooms_max: 3 })])).toBe(false);
    expect(hasSameRadar(SEARCH, [])).toBe(false);
  });
});

describe("hasRadarFor (return banner, radar card in the feed; legacy hasRadarFor)", () => {
  it("custom filters: only a radar with the same filters, on or paused", () => {
    expect(hasRadarFor(SEARCH, [radarOf(A, SEARCH, false)])).toBe(true);
    expect(hasRadarFor(SEARCH, [radarOf(A, { ...defaultFilters("rent_long", "tashkent"), price_max: 500 })])).toBe(false);
  });

  it("default filters: also any radar of the same base deal in the same city, on or paused", () => {
    const rent = defaultFilters("rent_long", "tashkent");
    expect(hasRadarFor(rent, [radarOf(A, SEARCH, false)])).toBe(true);
    // Daily rent belongs to the base deal of long-term rent.
    expect(hasRadarFor(rent, [radarOf(A, { ...defaultFilters("rent_daily", "tashkent"), rooms_min: 1 })])).toBe(true);
    expect(hasRadarFor(defaultFilters("sale", "tashkent"), [radarOf(A, { ...defaultFilters("sale", "tashkent"), price_max: 90_000 })])).toBe(true);
  });

  it("default filters: another base deal or another city does not count", () => {
    const rent = defaultFilters("rent_long", "tashkent");
    expect(hasRadarFor(rent, [radarOf(A, { ...defaultFilters("sale", "tashkent"), rooms_min: 2 })])).toBe(false);
    expect(hasRadarFor(rent, [radarOf(A, { ...defaultFilters("rent_long", "samarkand"), rooms_min: 2 })])).toBe(false);
    expect(hasRadarFor(rent, [])).toBe(false);
  });

  it("a radar without a city reads as Tashkent (legacy's fallback, through normalizeFilters)", () => {
    const cityless = radarOf(A, { deal: "rent_long", rooms_min: 2 });
    expect(hasRadarFor(defaultFilters("rent_long", "tashkent"), [cityless])).toBe(true);
    expect(hasRadarFor(defaultFilters("rent_long", "samarkand"), [cityless])).toBe(false);
  });

  it("daily rent is custom (BR-APP-013): its defaults match only the same filters", () => {
    const daily = defaultFilters("rent_daily", "tashkent");
    expect(hasRadarFor(daily, [radarOf(A, SEARCH)])).toBe(false);
    expect(hasRadarFor(daily, [radarOf(A, daily, false)])).toBe(true);
  });
});

describe("hasActiveRadar", () => {
  it("only an active radar with the same filters", () => {
    expect(hasActiveRadar(SEARCH, [radarOf(A, SEARCH, false), radarOf(B, { ...SEARCH, posted_days: 30 })])).toBe(true);
    expect(hasActiveRadar(SEARCH, [radarOf(A, SEARCH, false)])).toBe(false);
    expect(hasActiveRadar(SEARCH, [radarOf(A, { ...SEARCH, owner: "owners" })])).toBe(false);
  });
});

describe("useHasActiveRadar (filters footer ✓, few-results note)", () => {
  it("reads the plain radar list once and answers from it: false until it lands", async () => {
    const { result } = renderHook(() => useHasActiveRadar(SEARCH));

    expect(result.current).toBe(false);
    expect(state.sent.map((call) => [call.path, call.query])).toEqual([["radars", undefined]]);
    await act(async () => state.sent[0].resolve(ok([raw(B, defaultFilters("sale")), raw(A, { ...SEARCH, posted_days: null })])));

    expect(result.current).toBe(true);
  });

  it.each([
    ["a paused radar with the same filters", [raw(A, SEARCH, false)]],
    ["an active radar with other filters", [raw(A, { ...SEARCH, rooms_min: 1 })]],
    ["no radar", []],
  ])("%s: false", async (_, list) => {
    const { result } = renderHook(() => useHasActiveRadar(SEARCH));
    await act(async () => state.sent[0].resolve(ok(list)));

    expect(result.current).toBe(false);
  });

  it("a failed read answers false", async () => {
    const { result } = renderHook(() => useHasActiveRadar(SEARCH));
    await act(async () => state.sent[0].resolve({ ok: false, error: "server", status: 500, method: "GET", path: "radars" }));

    expect(result.current).toBe(false);
  });

  it("the footer and the note share one read", () => {
    renderHook(() => useHasActiveRadar(SEARCH));
    renderHook(() => useHasActiveRadar(defaultFilters()));

    expect(state.sent).toHaveLength(1);
  });

  it("radars switched off (DEC-51) or no reference data yet: false and nothing requested", () => {
    feedReference({ reference: { radars_enabled: false } });
    expect(renderHook(() => useHasActiveRadar(SEARCH)).result.current).toBe(false);
    cleanup();

    feedReference({ reference: null });
    expect(renderHook(() => useHasActiveRadar(SEARCH)).result.current).toBe(false);
    expect(state.sent).toEqual([]);
  });

  it("the caller's gate off (the footer of the radar forms): false and nothing requested; on, it reads", async () => {
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useHasActiveRadar(SEARCH, enabled), {
      initialProps: { enabled: false },
    });
    expect(result.current).toBe(false);
    expect(state.sent).toEqual([]);

    rerender({ enabled: true });
    expect(state.sent.map((call) => [call.path, call.query])).toEqual([["radars", undefined]]);
    await act(async () => state.sent[0].resolve(ok([raw(A, SEARCH)])));
    expect(result.current).toBe(true);

    // Gated off again over the loaded list: still false, no second read.
    rerender({ enabled: false });
    expect(result.current).toBe(false);
    expect(state.sent).toHaveLength(1);
  });

  it("before the session is ready: false and nothing requested", () => {
    state.status = "booting";

    expect(renderHook(() => useHasActiveRadar(SEARCH)).result.current).toBe(false);
    expect(state.sent).toEqual([]);
  });
});
