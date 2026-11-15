import { describe, expect, it } from "vitest";

import { defaultFilters } from "../src/defaults";
import { normalizeSort, parseSort, sortOptions } from "../src/sort";
import type { CityRef, Deal, ListingSort, PropertyType } from "../src/types";

const f = (deal: Deal, types: PropertyType[] = ["apartment"]) => ({ ...defaultFilters(deal), types });
const zones = [{ code: "center", name: "Центр" }];
const city = (medians: boolean, hasZones: boolean): CityRef => ({
  code: "c",
  name: "C",
  has_median: medians,
  zones: hasZones ? zones : [],
});

describe("sortOptions", () => {
  // deal × apartment-only × medians × zones → options
  const matrix: [Deal, boolean, boolean, boolean, ListingSort[]][] = [
    ["sale", true, true, true, ["new", "cheap", "expensive", "deal", "center", "ppm"]],
    ["sale", true, true, false, ["new", "cheap", "expensive", "deal", "ppm"]],
    ["sale", true, false, true, ["new", "cheap", "expensive", "center", "ppm"]],
    ["sale", true, false, false, ["new", "cheap", "expensive", "ppm"]],
    ["sale", false, true, true, ["new", "cheap", "expensive", "center", "ppm"]],
    ["sale", false, false, false, ["new", "cheap", "expensive", "ppm"]],
    ["rent_long", true, true, true, ["new", "cheap", "expensive", "deal", "center"]],
    ["rent_long", true, true, false, ["new", "cheap", "expensive", "deal"]],
    ["rent_long", true, false, true, ["new", "cheap", "expensive", "center"]],
    ["rent_long", false, true, true, ["new", "cheap", "expensive", "center"]],
    ["rent_long", false, false, false, ["new", "cheap", "expensive"]],
    ["rent_daily", true, true, true, ["new", "cheap", "expensive", "center"]],
    ["rent_daily", true, true, false, ["new", "cheap", "expensive"]],
    ["rent_daily", false, false, true, ["new", "cheap", "expensive", "center"]],
  ];

  it.each(matrix)("BR-APP-023 %s, apartment-only %s, medians %s, zones %s", (deal, only, medians, hasZones, expected) => {
    const types: PropertyType[] = only ? ["apartment"] : ["apartment", "house"];
    expect(sortOptions(f(deal, types), city(medians, hasZones))).toEqual(expected);
  });

  it.each<Deal>(["sale", "rent_long", "rent_daily"])(
    "LB-APP-023 before the reference data arrives (%s) only the three basic sorts are offered",
    (deal) => {
      // Legacy: `city?.zones.length !== 0` is true for a null city, so «Ближе к центру» was offered.
      expect(sortOptions(f(deal), null)).toEqual(["new", "cheap", "expensive"]);
      expect(sortOptions(f(deal), undefined)).toEqual(["new", "cheap", "expensive"]);
    },
  );

  it("LB-APP-023 a city without a zones field does not throw and offers no center sort", () => {
    // Legacy threw on `city.zones.length` for a fallback city without `zones`.
    expect(() => sortOptions(f("rent_long"), { code: "x", has_median: true })).not.toThrow();
    expect(sortOptions(f("rent_long"), { code: "x", has_median: true })).toEqual(["new", "cheap", "expensive", "deal"]);
  });

  it("BR-APP-023 a city without a median mark offers no deal sort", () => {
    expect(sortOptions(f("rent_long"), { code: "x", zones: [] })).toEqual(["new", "cheap", "expensive"]);
  });
});

describe("normalizeSort", () => {
  it("BR-APP-023 an available sort is kept, an unavailable one falls back to new", () => {
    const options = sortOptions(f("rent_long"), city(true, false));
    expect(normalizeSort("deal", options)).toBe("deal");
    expect(normalizeSort("center", options)).toBe("new");
    expect(normalizeSort("ppm", options)).toBe("new");
  });

  it("BR-APP-023 a stored center sort falls back to new in a city without zones", () => {
    expect(normalizeSort("center", sortOptions(f("rent_long"), city(true, true)))).toBe("center");
    expect(normalizeSort("center", sortOptions(f("rent_long"), city(true, false)))).toBe("new");
  });

  it("BR-APP-023 an unknown value is new", () => {
    expect(normalizeSort("closest", sortOptions(f("rent_long"), null))).toBe("new");
    expect(normalizeSort(undefined, sortOptions(f("rent_long"), null))).toBe("new");
    expect(parseSort("cheap")).toBe("cheap");
    expect(parseSort("CHEAP")).toBe("new");
    expect(parseSort(null)).toBe("new");
  });
});
