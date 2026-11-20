import { describe, expect, it } from "vitest";

import {
  baseDeal,
  DEFAULT_CITY,
  DEFAULT_RULES,
  defaultFilters,
  isApartmentOnly,
  isApartmentSearch,
  NO_ROOMS_TYPES,
  TYPES_BY_DEAL,
} from "../src/defaults";
import { FILTER_KEYS } from "../src/types";

describe("defaultFilters", () => {
  it("BR-APP-001 gives long rent in Tashkent with apartments, any owner, empty lists, the rest null or false", () => {
    expect(defaultFilters()).toEqual({
      city: "tashkent",
      deal: "rent_long",
      owner: "any",
      types: ["apartment"],
      districts: [],
      renovation: [],
      appliances: [],
      rooms_min: null,
      rooms_max: null,
      price_min: null,
      price_max: null,
      area_min: null,
      area_max: null,
      posted_days: null,
      furnished: null,
      floor_not_first: false,
      floor_not_last: false,
      market: null,
      zones: [],
      near_metro: false,
      below_median: false,
      tenant: null,
      pets: false,
      pets_only: false,
      polygon: null,
    });
  });

  it("BR-APP-001 has exactly the 25 keys of the model, in the order of FILTER_KEYS", () => {
    expect(FILTER_KEYS).toHaveLength(25);
    expect(Object.keys(defaultFilters())).toEqual([...FILTER_KEYS]);
  });

  it("BR-APP-001 takes the deal and the city", () => {
    const filters = defaultFilters("sale", "fergana");
    expect(filters.deal).toBe("sale");
    expect(filters.city).toBe("fergana");
    expect(filters.types).toEqual(["apartment"]);
    expect(DEFAULT_CITY).toBe("tashkent");
  });

  it("BR-APP-001 returns a fresh object each time", () => {
    expect(defaultFilters()).not.toBe(defaultFilters());
    expect(defaultFilters().types).not.toBe(defaultFilters().types);
  });
});

describe("deal helpers", () => {
  it("baseDeal counts daily rent as rent", () => {
    expect(baseDeal("rent_long")).toBe("rent_long");
    expect(baseDeal("rent_daily")).toBe("rent_long");
    expect(baseDeal("sale")).toBe("sale");
  });

  it("BR-APP-005 lists the types of each deal", () => {
    expect(TYPES_BY_DEAL).toEqual({
      rent_long: ["apartment", "house", "room", "commercial"],
      rent_daily: ["apartment", "house", "room"],
      sale: ["apartment", "house", "commercial", "land"],
    });
  });

  it("BR-APP-006 names the types without rooms", () => {
    expect([...NO_ROOMS_TYPES].sort()).toEqual(["commercial", "land", "room"]);
  });

  it("isApartmentOnly and isApartmentSearch (daily is not an apartment search)", () => {
    expect(isApartmentOnly(defaultFilters("rent_daily"))).toBe(true);
    expect(isApartmentSearch(defaultFilters("rent_daily"))).toBe(false);
    expect(isApartmentSearch(defaultFilters("sale"))).toBe(true);
    expect(isApartmentSearch({ ...defaultFilters(), types: ["apartment", "house"] })).toBe(false);
  });

  it("the rules default to the pinned release (DEC-58): only the pets rule legacy adopted is on", () => {
    expect(DEFAULT_RULES).toEqual({
      dev017TenantPetsDailyRule: false,
      dev017PetsLongRentOnly: true,
      dev018ResetKeepsDaily: false,
      dev025ValidateRanges: false,
      dev052UnifiedBelowMedianRule: false,
      dev005RadarDropsPostedDays: false,
    });
  });
});
