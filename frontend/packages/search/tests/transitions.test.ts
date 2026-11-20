import { describe, expect, it } from "vitest";

import { defaultFilters } from "../src/defaults";
import {
  applyPreset,
  isPresetSelected,
  pickCity,
  presetSource,
  resetAll,
  resetQuick,
  setGeography,
  switchDeal,
  switchRentTerm,
  toggleDistrict,
  toggleType,
  toggleZone,
} from "../src/transitions";
import type { CityRef, SearchFilters } from "../src/types";
import { fergana, stats, tashkent } from "./support";

const triangle = [
  [41.3, 69.2],
  [41.31, 69.25],
  [41.29, 69.3],
] as const;

const busy: SearchFilters = {
  ...defaultFilters("rent_long", "tashkent"),
  types: ["apartment", "room"],
  districts: ["yunusabad"],
  rooms_min: 2,
  rooms_max: 3,
  price_min: 200,
  price_max: 600,
  near_metro: true,
  below_median: false,
  owner: "owners",
  tenant: "family",
  pets: true,
  furnished: true,
  renovation: ["euro"],
  floor_not_first: true,
  appliances: ["washer"],
  posted_days: 3,
};

describe("switchDeal", () => {
  it("BR-APP-002 resets to the new deal's defaults and keeps districts, zones and polygon", () => {
    const before = { ...busy, zones: ["center"], polygon: triangle } as SearchFilters;
    expect(switchDeal(before, "sale")).toEqual({
      ...defaultFilters("sale", "tashkent"),
      districts: ["yunusabad"],
      zones: ["center"],
      polygon: triangle,
    });
  });

  it("BR-APP-002 keeps the city and goes back from sale to long rent", () => {
    const sale = { ...defaultFilters("sale", "fergana"), market: "new", area_min: 40 } as SearchFilters;
    expect(switchDeal(sale, "rent_long")).toEqual(defaultFilters("rent_long", "fergana"));
  });

  it("BR-APP-002 does nothing when the base deal does not change (daily rent is rent)", () => {
    const daily = { ...defaultFilters("rent_daily"), price_max: 50 };
    expect(switchDeal(daily, "rent_long")).toEqual(daily);
    expect(switchDeal(busy, "rent_long")).toEqual(busy);
  });
});

describe("switchRentTerm", () => {
  it("BR-APP-003 to daily: keeps allowed types, resets price and below-median, clears tenant and pets", () => {
    const before = { ...busy, types: ["apartment", "commercial"], below_median: true, pets_only: true, pets: false };
    expect(switchRentTerm(before as SearchFilters, "rent_daily")).toEqual({
      ...before,
      deal: "rent_daily",
      types: ["apartment"],
      price_min: null,
      price_max: null,
      below_median: false,
      tenant: null,
      pets: false,
      pets_only: false,
    });
  });

  it("BR-APP-003 to daily: no allowed type left gives apartments", () => {
    expect(switchRentTerm({ ...busy, types: ["commercial"] }, "rent_daily").types).toEqual(["apartment"]);
  });

  it("BR-APP-003 to long rent: keeps tenant and pets, resets price and below-median", () => {
    const daily = { ...busy, deal: "rent_daily", types: ["house", "room"], below_median: true } as SearchFilters;
    expect(switchRentTerm(daily, "rent_long")).toEqual({
      ...daily,
      deal: "rent_long",
      price_min: null,
      price_max: null,
      below_median: false,
    });
  });

  it("BR-APP-020 an area range survives a long ↔ daily switch and a switch to sale clears it (DEC-62)", () => {
    const rent = { ...busy, area_min: 40, area_max: 80 } as SearchFilters;
    const daily = switchRentTerm(rent, "rent_daily");
    expect([daily.area_min, daily.area_max]).toEqual([40, 80]);
    const back = switchRentTerm(daily, "rent_long");
    expect([back.area_min, back.area_max]).toEqual([40, 80]);
    const sale = switchDeal(daily, "sale");
    expect([sale.area_min, sale.area_max]).toEqual([null, null]);
  });

  it("BR-APP-003 picking the current term changes nothing", () => {
    expect(switchRentTerm(busy, "rent_long")).toEqual(busy);
  });
});

describe("toggleType", () => {
  it("BR-APP-005 adds and removes a type", () => {
    expect(toggleType(defaultFilters(), "house").types).toEqual(["apartment", "house"]);
    expect(toggleType({ ...defaultFilters(), types: ["apartment", "house"] }, "apartment").types).toEqual(["house"]);
  });

  it("BR-APP-005 the last type cannot be removed", () => {
    expect(toggleType(defaultFilters(), "apartment").types).toEqual(["apartment"]);
    expect(toggleType({ ...defaultFilters(), types: ["house"] }, "house").types).toEqual(["house"]);
  });

  it("BR-APP-005 below_median is dropped when a second type is added and survives only for apartments", () => {
    const below = { ...defaultFilters(), below_median: true };
    expect(toggleType(below, "house").below_median).toBe(false);
    const two = { ...defaultFilters(), types: ["apartment", "house"], below_median: true } as SearchFilters;
    expect(toggleType(two, "house")).toMatchObject({ types: ["apartment"], below_median: true });
    expect(toggleType({ ...two, types: ["house", "room"] }, "room")).toMatchObject({
      types: ["house"],
      below_median: false,
    });
  });

  it("BR-APP-005 a type the deal does not offer is not added and changes nothing", () => {
    expect(toggleType(defaultFilters("rent_daily"), "commercial").types).toEqual(["apartment"]);
    expect(toggleType(defaultFilters("rent_long"), "land").types).toEqual(["apartment"]);
    const below = { ...defaultFilters("rent_long"), below_median: true };
    expect(toggleType(below, "land")).toEqual(below);
  });
});

describe("setGeography", () => {
  const all = { ...defaultFilters(), near_metro: true };

  it("BR-APP-008 a polygon clears zones and districts", () => {
    expect(setGeography({ ...all, zones: ["center"], districts: ["yunusabad"] }, { polygon: triangle })).toEqual({
      ...all,
      polygon: triangle,
    });
  });

  it("BR-APP-008 zones clear the polygon and districts, in the order center, near_center", () => {
    const before = { ...all, polygon: triangle, districts: ["yunusabad"] };
    expect(setGeography(before, { zones: ["near_center", "center"] })).toEqual({ ...all, zones: ["center", "near_center"] });
  });

  it("BR-APP-008 districts clear the polygon and zones", () => {
    expect(setGeography({ ...all, polygon: triangle, zones: ["center"] }, { districts: ["chilanzar"] })).toEqual({
      ...all,
      districts: ["chilanzar"],
    });
  });

  it("BR-APP-008 near_metro is independent of the mode", () => {
    expect(setGeography(all, { zones: ["center"] }).near_metro).toBe(true);
    expect(setGeography(all, { polygon: null }).near_metro).toBe(true);
  });

  it("BR-APP-008 toggling a zone keeps the canonical order and clears the other modes", () => {
    const near = toggleZone({ ...all, districts: ["yunusabad"] }, "near_center");
    expect(near).toMatchObject({ zones: ["near_center"], districts: [], polygon: null });
    expect(toggleZone(near, "center").zones).toEqual(["center", "near_center"]);
    expect(toggleZone({ ...all, zones: ["center", "near_center"] }, "center").zones).toEqual(["near_center"]);
  });

  it("BR-APP-008 toggling a district appends or removes it and clears the other modes", () => {
    const one = toggleDistrict({ ...all, zones: ["center"], polygon: triangle }, "sergeli");
    expect(one).toMatchObject({ districts: ["sergeli"], zones: [], polygon: null });
    expect(toggleDistrict(one, "yunusabad").districts).toEqual(["sergeli", "yunusabad"]);
    expect(toggleDistrict(toggleDistrict(one, "yunusabad"), "sergeli").districts).toEqual(["yunusabad"]);
  });
});

describe("pickCity", () => {
  const before: SearchFilters = {
    ...defaultFilters("rent_long", "tashkent"),
    districts: ["yunusabad"],
    zones: ["center"],
    polygon: null,
    near_metro: true,
    below_median: true,
    price_max: 600,
  };
  const city = (code: string, over: Partial<CityRef>): CityRef => ({
    code,
    name: code,
    zones: [],
    districts: [],
    has_metro: false,
    has_median: false,
    ...over,
  });
  const zones = [
    { code: "center", name: "Центр" },
    { code: "near_center", name: "Ближе к центру" },
  ];

  // metro × medians × zones
  const matrix: [boolean, boolean, boolean][] = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ];

  it.each(matrix)("BR-APP-009 metro %s × medians %s × zones %s", (metro, median, hasZones) => {
    const next = pickCity(before, city("samarkand", { has_metro: metro, has_median: median, zones: hasZones ? zones : [] }));
    expect(next).toEqual({
      ...before,
      city: "samarkand",
      districts: [],
      polygon: null,
      zones: hasZones ? ["center"] : [],
      near_metro: metro,
      below_median: median,
    });
  });

  it("BR-APP-009 clears a polygon", () => {
    const drawn = { ...before, city: "fergana", zones: [], districts: [], polygon: triangle };
    expect(pickCity(drawn, tashkent())).toMatchObject({ city: "tashkent", polygon: null });
  });

  it("LB-APP-007 a city object without metro or median marks leaves both at false, not undefined", () => {
    const next = pickCity(before, { code: "samarkand", zones: [] } as CityRef);
    expect(next.near_metro).toBe(false);
    expect(next.below_median).toBe(false);
    expect(Object.values(next)).not.toContain(undefined);
  });

  it("BR-APP-009 picking the current city changes nothing", () => {
    expect(pickCity(before, tashkent())).toEqual(before);
  });

  it("BR-APP-009 a city object without zones clears zones and does not throw", () => {
    expect(pickCity(before, { code: "andijan" }).zones).toEqual([]);
    expect(pickCity(before, fergana()).zones).toEqual([]);
  });
});

describe("resetAll", () => {
  const daily = { ...defaultFilters("rent_daily", "fergana"), price_max: 50, near_metro: true };

  it("BR-APP-022 gives the defaults of the base deal and the city", () => {
    expect(resetAll(busy, "tashkent")).toEqual(defaultFilters("rent_long", "tashkent"));
    expect(resetAll({ ...defaultFilters("sale", "fergana"), market: "new" } as SearchFilters, "fergana")).toEqual(
      defaultFilters("sale", "fergana"),
    );
    expect(resetAll(busy)).toEqual(defaultFilters("rent_long", "tashkent"));
  });

  it("LB-APP-030 dev018ResetKeepsDaily off (legacy): reset leaves daily rent for long rent", () => {
    expect(resetAll(daily, "fergana")).toEqual(defaultFilters("rent_long", "fergana"));
    expect(resetAll(daily, "fergana", { dev018ResetKeepsDaily: false }).deal).toBe("rent_long");
  });

  it("LB-APP-030 dev018ResetKeepsDaily on: reset keeps daily rent", () => {
    expect(resetAll(daily, "fergana", { dev018ResetKeepsDaily: true })).toEqual(defaultFilters("rent_daily", "fergana"));
    expect(resetAll(busy, "tashkent", { dev018ResetKeepsDaily: true })).toEqual(defaultFilters("rent_long", "tashkent"));
  });
});

describe("resetQuick", () => {
  const before = { ...busy, below_median: true, types: ["apartment"] } as SearchFilters;

  it("BR-APP-022 rooms resets only the rooms", () => {
    expect(resetQuick(before, "rooms")).toEqual({ ...before, rooms_min: null, rooms_max: null });
  });

  it("BR-APP-022 price resets the price and also clears below_median", () => {
    expect(resetQuick(before, "price")).toEqual({ ...before, price_min: null, price_max: null, below_median: false });
  });

  it("BR-APP-022 owner resets only the owner", () => {
    expect(resetQuick(before, "owner")).toEqual({ ...before, owner: "any" });
  });
});

describe("price presets", () => {
  it("BR-APP-014 a preset sets price_max and clears price_min", () => {
    expect(applyPreset({ ...defaultFilters(), price_min: 200, price_max: 900 }, 500)).toMatchObject({
      price_min: null,
      price_max: 500,
    });
  });

  it("BR-APP-014 the selected preset tapped again clears the price", () => {
    expect(applyPreset({ ...defaultFilters(), price_max: 500 }, 500)).toMatchObject({ price_min: null, price_max: null });
  });

  it("BR-APP-014 a preset shows as selected only with no minimum", () => {
    expect(isPresetSelected({ ...defaultFilters(), price_max: 500 }, 500)).toBe(true);
    expect(isPresetSelected({ ...defaultFilters(), price_max: 500, price_min: 100 }, 500)).toBe(false);
    expect(isPresetSelected({ ...defaultFilters(), price_max: 400 }, 500)).toBe(false);
  });

  it("BR-APP-014 city presets come before the reference presets", () => {
    const reference = { rent_long: [100, 200], rent_daily: [10], sale: [1000] };
    expect(presetSource("rent_long", stats(), reference)).toEqual({ values: [300, 400, 500], fromCity: true });
    expect(presetSource("rent_long", stats({ price_presets: { sale: [1] } }), reference)).toEqual({
      values: [100, 200],
      fromCity: false,
    });
    expect(presetSource("sale", null, reference)).toEqual({ values: [1000], fromCity: false });
    expect(presetSource("rent_daily", null, null)).toEqual({ values: [], fromCity: false });
  });
});
