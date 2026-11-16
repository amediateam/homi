import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReferenceProvider } from "@/lib/reference/ReferenceProvider";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import { resetReference, useCitiesStats, useCityStats, useReference } from "@/lib/reference/useReference";

const tashkent = {
  code: "tashkent",
  name: "Ташкент",
  center: { lat: 41.3, lon: 69.2 },
  zoom: 12,
  is_region: false,
  has_metro: true,
  has_median: true,
  districts: [],
  zones: [],
};

afterEach(() => {
  cleanup();
  resetReference();
});

function feed(reference: unknown, cities: unknown[] = []) {
  render(<ReferenceProvider reference={{ loaded: true, data: reference as typeof EMPTY_REFERENCE }} cities={{ loaded: true, data: cities as [] }} />);
}

describe("useReference (WP-22, DEC-51)", () => {
  it("passes radars_enabled true and false through", () => {
    feed({ ...EMPTY_REFERENCE, radars_enabled: true });
    expect(renderHook(() => useReference()).result.current.radarsEnabled).toBe(true);

    feed({ ...EMPTY_REFERENCE, radars_enabled: false });
    expect(renderHook(() => useReference()).result.current.radarsEnabled).toBe(false);
  });

  it("an absent key and an empty reference read as false; the radar limit falls back to 10", () => {
    const withoutKeys: Record<string, unknown> = { ...EMPTY_REFERENCE };
    delete withoutKeys.radars_enabled;
    delete withoutKeys.limits;
    feed(withoutKeys);
    expect(renderHook(() => useReference()).result.current).toMatchObject({ radarsEnabled: false, radarLimit: 10 });

    resetReference();
    const empty = renderHook(() => useReference()).result.current;
    expect(empty).toMatchObject({ loaded: false, radarsEnabled: false, radarLimit: 10, cities: [], supportUsername: null });
  });

  it("findCity and the support account; useCityStats per city", () => {
    feed(
      { ...EMPTY_REFERENCE, cities: [tashkent], bot: { username: "homi_bot", support_username: "homi_help" }, limits: { radars: 5 } },
      [{ code: "tashkent", counts: { rent_long: 4, rent_daily: 0, sale: 2 }, price_presets: { sale: [40_000] }, typical_price: { sale: 90_000 } }],
    );

    const reference = renderHook(() => useReference()).result.current;
    expect(reference.findCity("tashkent")?.name).toBe("Ташкент");
    expect(reference.findCity("nowhere")).toBeNull();
    expect(reference).toMatchObject({ loaded: true, radarLimit: 5, supportUsername: "homi_help", botUsername: "homi_bot" });
    expect(renderHook(() => useCityStats("tashkent")).result.current?.counts.rent_daily).toBe(0);
    expect(renderHook(() => useCityStats("samarkand")).result.current).toBeNull();
  });

  it("useCitiesStats: every city by code once loaded; null while loading and after a failed read (WP-23, D-S-12)", () => {
    const tashkentStats = { code: "tashkent", counts: { rent_long: 4, rent_daily: 1, sale: 2 }, price_presets: {}, typical_price: {} };
    const samarkandStats = { code: "samarkand", counts: { rent_long: 0, rent_daily: 0, sale: 7 }, price_presets: {}, typical_price: {} };

    const before = renderHook(() => useCitiesStats());
    expect(before.result.current).toEqual({ stats: null, loaded: false });

    feed(EMPTY_REFERENCE, [tashkentStats, samarkandStats]);
    before.rerender();
    expect(before.result.current).toEqual({ stats: { tashkent: tashkentStats, samarkand: samarkandStats }, loaded: true });
    const first = before.result.current;
    before.rerender();
    expect(before.result.current).toBe(first);

    render(<ReferenceProvider reference={{ loaded: false, data: EMPTY_REFERENCE }} cities={{ loaded: false, data: [] }} />);
    expect(renderHook(() => useCitiesStats()).result.current).toEqual({ stats: null, loaded: false });
  });
});
