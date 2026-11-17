import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";
import type { CityStats } from "@/lib/reference/types";

const sent = vi.hoisted(() => [] as { path: string; options: BffOptions | undefined; resolve: (answer: ApiResult<unknown>) => void }[]);
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options?: BffOptions) => new Promise<ApiResult<unknown>>((resolve) => sent.push({ path, options, resolve })),
}));

import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import { refreshCitiesStats, resetReference, setReference, useCitiesStats, useCityStats, useReference } from "@/lib/reference/useReference";

const REFERENCE = { ...EMPTY_REFERENCE, radars_enabled: true, cities: [{ code: "tashkent", name: "Ташкент" }] } as typeof EMPTY_REFERENCE;
const OLD: CityStats[] = [{ code: "tashkent", counts: { rent_long: 10, rent_daily: 1, sale: 5 }, price_presets: {}, typical_price: {} }];
const NEW: CityStats[] = [{ code: "tashkent", counts: { rent_long: 12, rent_daily: 2, sale: 6 }, price_presets: {}, typical_price: {} }];

const refresh = async (answer: ApiResult<unknown>) => {
  const done = refreshCitiesStats();
  await act(async () => {
    sent.at(-1)!.resolve(answer);
    await done;
  });
};

beforeEach(() => {
  sent.length = 0;
  setReference({ reference: { loaded: true, data: REFERENCE, source: "legacy" }, cities: { loaded: true, data: OLD, source: "legacy" } });
});

afterEach(() => {
  cleanup();
  resetReference();
});

describe("refreshCitiesStats (WP-25)", () => {
  it("reads GET /cities through /bff and replaces only the city statistics", async () => {
    const stats = renderHook(() => useCityStats("tashkent"));
    const reference = renderHook(() => useReference());

    await refresh({ ok: true, data: NEW, meta: { source: "stub" } });

    expect(sent.map((request) => request.path)).toEqual(["cities"]);
    expect(stats.result.current?.counts).toEqual(NEW[0].counts);
    expect(reference.result.current.radarsEnabled).toBe(true);
    expect(reference.result.current.cities).toEqual(REFERENCE.cities);
  });

  it("fills statistics that the server read could not load", async () => {
    resetReference();
    const all = renderHook(() => useCitiesStats());
    expect(all.result.current).toEqual({ stats: null, loaded: false });

    await refresh({ ok: true, data: NEW, meta: {} });

    expect(all.result.current).toEqual({ stats: { tashkent: NEW[0] }, loaded: true });
  });

  it("a failed or malformed answer changes nothing", async () => {
    const stats = renderHook(() => useCityStats("tashkent"));

    await refresh({ ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "GET", path: "cities" });
    await refresh({ ok: false, error: "offline", status: 0, method: "GET", path: "cities" });
    await refresh({ ok: true, data: null, meta: {} });
    await refresh({ ok: true, data: { code: "tashkent" }, meta: {} });

    expect(stats.result.current?.counts).toEqual(OLD[0].counts);
  });

  it("keeps only the elements with a code: a null, a number or a codeless element never reaches a render (S-2)", async () => {
    const andijan = { code: "andijan", counts: { rent_long: 210, rent_daily: 5, sale: 430 }, price_presets: {}, typical_price: {} };
    const one = renderHook(() => useCityStats("andijan"));
    const all = renderHook(() => useCitiesStats());

    await refresh({ ok: true, data: [null, 1, "tashkent", [], { counts: {} }, { code: 7 }, ...NEW, andijan], meta: {} });

    expect(one.result.current).toEqual(andijan);
    expect(all.result.current).toEqual({ stats: { tashkent: NEW[0], andijan }, loaded: true });
    expect(renderHook(() => useCityStats("nowhere")).result.current).toBeNull();
  });

  it("opens close together share one request; a later open asks again", async () => {
    const first = refreshCitiesStats();
    const second = refreshCitiesStats();
    expect(second).toBe(first);
    expect(sent).toHaveLength(1);

    await act(async () => {
      sent[0].resolve({ ok: true, data: NEW, meta: {} });
      await first;
    });
    await refresh({ ok: true, data: OLD, meta: {} });
    expect(sent).toHaveLength(2);
  });

  it("never rejects", async () => {
    await expect(refresh({ ok: false, error: "server", status: 500, method: "GET", path: "cities" })).resolves.toBeUndefined();
  });
});
