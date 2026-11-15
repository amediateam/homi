import { describe, expect, it } from "vitest";

import { belowMedianAvailable, fixRanges, sectionsFor } from "../src/availability";
import { defaultFilters } from "../src/defaults";
import type { CityRef, Deal, PropertyType, SearchFilters, SearchMode } from "../src/types";
import { fergana, stats, tashkent } from "./support";

const f = (deal: Deal, types: PropertyType[] = ["apartment"], over: Partial<SearchFilters> = {}): SearchFilters => ({
  ...defaultFilters(deal),
  types,
  ...over,
});
const modes: SearchMode[] = ["search", "radar-new", "radar-edit"];

describe("sectionsFor", () => {
  it("BR-APP-004 the rent term shows for rent when daily is selected or the city has daily listings", () => {
    expect(sectionsFor(f("rent_long"), tashkent(), "search", {}, stats()).rentTerm).toBe(true);
    expect(sectionsFor(f("rent_long"), tashkent(), "search", {}, stats({ counts: { rent_daily: 0 } })).rentTerm).toBe(
      false,
    );
    expect(sectionsFor(f("rent_long"), tashkent(), "search").rentTerm).toBe(false);
    expect(sectionsFor(f("rent_daily"), tashkent(), "search").rentTerm).toBe(true);
    expect(sectionsFor(f("sale"), tashkent(), "search", {}, stats()).rentTerm).toBe(false);
  });

  it("BR-APP-006 rooms are hidden only when every type is room, commercial or land", () => {
    const rooms = (deal: Deal, types: PropertyType[]) => sectionsFor(f(deal, types), tashkent(), "search").rooms;
    expect(rooms("rent_long", ["apartment"])).toBe(true);
    expect(rooms("rent_long", ["room"])).toBe(false);
    expect(rooms("rent_long", ["room", "commercial"])).toBe(false);
    expect(rooms("rent_long", ["room", "house"])).toBe(true);
    expect(rooms("sale", ["land"])).toBe(false);
    expect(rooms("sale", ["commercial", "land"])).toBe(false);
    expect(rooms("sale", ["house", "land"])).toBe(true);
  });

  it("BR-APP-016 the typical price shows for apartment-only searches (daily included) in a named city", () => {
    const typical = (filters: SearchFilters, city: CityRef | null = tashkent()) =>
      sectionsFor(filters, city, "search", {}, stats()).typicalPrice;
    expect(typical(f("rent_long"))).toBe(700);
    expect(typical(f("rent_daily"))).toBe(45);
    expect(typical(f("sale"))).toBe(94000);
    expect(typical(f("rent_long", ["apartment", "house"]))).toBeNull();
    expect(typical(f("rent_long"), { ...tashkent(), name: "" })).toBeNull();
    expect(typical(f("rent_long"), null)).toBeNull();
    const saleOnly = stats({ typical_price: { sale: 1 } });
    expect(sectionsFor(f("rent_long"), tashkent(), "search", {}, saleOnly).typicalPrice).toBeNull();
    expect(sectionsFor(f("rent_long"), tashkent(), "search").typicalPrice).toBeNull();
  });

  it("BR-APP-018 the unit-price hint shows for sale searches with land or houses", () => {
    const hint = (deal: Deal, types: PropertyType[]) => sectionsFor(f(deal, types), tashkent(), "search").unitPriceHint;
    expect(hint("sale", ["land"])).toBe(true);
    expect(hint("sale", ["apartment", "house"])).toBe(true);
    expect(hint("sale", ["apartment", "commercial"])).toBe(false);
    expect(hint("rent_long", ["house"])).toBe(false);
  });

  it("BR-APP-019 tenant and pets show whenever the base deal is rent, daily included", () => {
    for (const mode of modes) {
      expect(sectionsFor(f("rent_long"), tashkent(), mode)).toMatchObject({ tenant: true, pets: true });
      expect(sectionsFor(f("rent_daily"), tashkent(), mode)).toMatchObject({ tenant: true, pets: true });
      expect(sectionsFor(f("sale"), tashkent(), mode)).toMatchObject({ tenant: false, pets: false });
    }
  });

  it("LB-APP-029 dev017TenantPetsDailyRule off (legacy): tenant and pets stay visible for daily rent", () => {
    expect(sectionsFor(f("rent_daily"), tashkent(), "search", { dev017TenantPetsDailyRule: false })).toMatchObject({
      tenant: true,
      pets: true,
    });
  });

  it("LB-APP-029 dev017TenantPetsDailyRule on: tenant and pets are hidden for daily rent only", () => {
    const rules = { dev017TenantPetsDailyRule: true };
    expect(sectionsFor(f("rent_daily"), tashkent(), "search", rules)).toMatchObject({ tenant: false, pets: false });
    expect(sectionsFor(f("rent_long"), tashkent(), "search", rules)).toMatchObject({ tenant: true, pets: true });
    expect(sectionsFor(f("sale"), tashkent(), "search", rules)).toMatchObject({ tenant: false, pets: false });
  });

  it("BR-APP-020 area and market for sale only, appliances for rent only", () => {
    expect(sectionsFor(f("sale"), tashkent(), "search")).toMatchObject({ area: true, market: true, appliances: false });
    expect(sectionsFor(f("rent_long"), tashkent(), "search")).toMatchObject({
      area: false,
      market: false,
      appliances: true,
    });
    expect(sectionsFor(f("rent_daily"), tashkent(), "search")).toMatchObject({
      area: false,
      market: false,
      appliances: true,
    });
  });

  it("BR-APP-021 posted days exist only in search mode", () => {
    expect(sectionsFor(f("rent_long"), tashkent(), "search").posted).toBe(true);
    expect(sectionsFor(f("rent_long"), tashkent(), "radar-new").posted).toBe(false);
    expect(sectionsFor(f("rent_long"), tashkent(), "radar-edit").posted).toBe(false);
  });

  it("sections are computed without reference data and do not throw", () => {
    expect(() => sectionsFor(f("sale", ["land"]), null, "search")).not.toThrow();
    expect(sectionsFor(f("rent_long"), null, "search").belowMedian).toBe(false);
  });
});

describe("belowMedianAvailable", () => {
  // deal × types × city medians
  const cases: [Deal, PropertyType[], CityRef | null, boolean][] = [
    ["rent_long", ["apartment"], tashkent(), true],
    ["sale", ["apartment"], tashkent(), true],
    ["rent_daily", ["apartment"], tashkent(), false],
    ["rent_long", ["apartment", "house"], tashkent(), false],
    ["rent_long", ["house"], tashkent(), false],
    ["sale", ["apartment"], fergana(), false],
    ["rent_long", ["apartment"], { code: "samarkand" }, false],
    ["rent_long", ["apartment"], null, false],
  ];

  it.each(cases)("BR-APP-017 %s %j in %j → %s", (deal, types, city, expected) => {
    expect(belowMedianAvailable(f(deal, types), city)).toBe(expected);
    expect(sectionsFor(f(deal, types), city, "search").belowMedian).toBe(expected);
  });

  it("dev052UnifiedBelowMedianRule off (legacy): row 17 applies", () => {
    expect(belowMedianAvailable(f("rent_long"), tashkent(), { dev052UnifiedBelowMedianRule: false })).toBe(true);
    expect(belowMedianAvailable(f("rent_daily"), tashkent(), { dev052UnifiedBelowMedianRule: false })).toBe(false);
  });

  it("dev052UnifiedBelowMedianRule on: no effect until DEV-052 is approved", () => {
    for (const [deal, types, city, expected] of cases) {
      expect(belowMedianAvailable(f(deal, types), city, { dev052UnifiedBelowMedianRule: true })).toBe(expected);
    }
  });

  it.todo("dev052UnifiedBelowMedianRule on: the single rule of DEV-052 as approved");
});

describe("fixRanges", () => {
  const inverted = { ...defaultFilters("sale"), price_min: 900, price_max: 100, area_min: 120, area_max: 40 };

  it("LB-APP-043 dev025ValidateRanges off (legacy): inverted price and area ranges are returned as typed", () => {
    expect(fixRanges(inverted)).toBe(inverted);
    expect(fixRanges(inverted, { dev025ValidateRanges: false })).toEqual(inverted);
  });

  it("LB-APP-043 dev025ValidateRanges on: swaps inverted price and area bounds", () => {
    expect(fixRanges(inverted, { dev025ValidateRanges: true })).toEqual({
      ...inverted,
      price_min: 100,
      price_max: 900,
      area_min: 40,
      area_max: 120,
    });
  });

  it("LB-APP-043 dev025ValidateRanges on: ordered, open and equal ranges are left alone", () => {
    const rules = { dev025ValidateRanges: true };
    const ordered = { ...defaultFilters("sale"), price_min: 100, price_max: 900, area_min: 40, area_max: null };
    expect(fixRanges(ordered, rules)).toEqual(ordered);
    const equal = { ...defaultFilters(), price_min: 500, price_max: 500 };
    expect(fixRanges(equal, rules)).toEqual(equal);
  });
});
