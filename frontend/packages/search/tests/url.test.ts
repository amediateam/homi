import { describe, expect, it } from "vitest";

import { defaultFilters } from "../src/defaults";
import { serializePolygon } from "../src/polygon";
import type { ListingSort, PolygonVertex, SearchFilters } from "../src/types";
import { cityFallback, fromSearchParams, SEARCH_PARAM_KEYS, toSearchParams } from "../src/url";

const ring = (n: number): PolygonVertex[] =>
  Array.from({ length: n }, (_, i) => [
    Math.round((41.3111 + 0.05 * Math.sin((2 * Math.PI * i) / n)) * 1e5) / 1e5,
    Math.round((69.2797 + 0.05 * Math.cos((2 * Math.PI * i) / n)) * 1e5) / 1e5,
  ]);

/** A state with every key away from its default (a sale, so area and market apply). */
const everything: SearchFilters = {
  city: "fergana",
  deal: "sale",
  owner: "owners",
  types: ["apartment", "house", "land"],
  districts: ["chilanzar", "yunusabad"],
  renovation: ["euro", "cosmetic"],
  appliances: ["washer"],
  rooms_min: 1,
  rooms_max: 3,
  price_min: 20000,
  price_max: 90000,
  area_min: 40,
  area_max: 120,
  posted_days: 7,
  furnished: false,
  floor_not_first: true,
  floor_not_last: true,
  market: "secondary",
  zones: ["center", "near_center"],
  near_metro: true,
  below_median: true,
  tenant: "women",
  pets: false,
  pets_only: true,
  polygon: ring(5),
};

const roundTrip = (filters: SearchFilters, sort: ListingSort = "new") => {
  const params = toSearchParams(filters, sort);
  return fromSearchParams(new URLSearchParams(params.toString()));
};

describe("toSearchParams / fromSearchParams", () => {
  it("round-trips a state with every one of the 25 keys set, and the sort", () => {
    expect(roundTrip(everything, "ppm")).toEqual({ filters: everything, sort: "ppm" });
    expect(roundTrip({ ...everything, pets_only: false, pets: true, furnished: true }, "cheap").filters).toMatchObject({
      pets: true,
      pets_only: false,
      furnished: true,
    });
  });

  it.each(Object.keys(everything) as (keyof SearchFilters)[])("round-trips the key %s alone", (key) => {
    const deal = ["types", "area_min", "area_max", "market"].includes(key) ? "sale" : "rent_long";
    const filters = { ...defaultFilters(deal, "tashkent"), [key]: everything[key] } as SearchFilters;
    expect(roundTrip(filters).filters).toEqual(filters);
  });

  it("omits every default, deal=rent_long and sort=new, and always writes the city", () => {
    expect(toSearchParams(defaultFilters("rent_long", "tashkent"), "new").toString()).toBe("city=tashkent");
    expect(toSearchParams(defaultFilters("sale", "fergana")).toString()).toBe("city=fergana&deal=sale");
    expect(toSearchParams(defaultFilters(), "cheap").toString()).toBe("city=tashkent&sort=cheap");
  });

  it("writes lists as repeated parameters, booleans as 1, furnished as 1 or 0, the polygon with 5 decimals", () => {
    const params = toSearchParams({
      ...defaultFilters(),
      types: ["apartment", "room"],
      near_metro: true,
      furnished: false,
      polygon: [
        [41.3, 69.2],
        [41.31, 69.25],
        [41.29, 69.3],
      ],
    });
    expect(params.getAll("types")).toEqual(["apartment", "room"]);
    expect(params.get("near_metro")).toBe("1");
    expect(params.get("furnished")).toBe("0");
    expect(params.get("polygon")).toBe("41.30000,69.20000;41.31000,69.25000;41.29000,69.30000");
  });

  it("emits the keys in one fixed order, whatever the order of the input object", () => {
    const shuffled = Object.fromEntries(Object.entries(everything).reverse()) as SearchFilters;
    const text = toSearchParams(everything, "ppm").toString();
    expect(toSearchParams(shuffled, "ppm").toString()).toBe(text);
    const names = [...new URLSearchParams(text).keys()].filter((name, i, all) => all.indexOf(name) === i);
    expect(names).toEqual(SEARCH_PARAM_KEYS.filter((name) => names.includes(name)));
    expect(text.startsWith("city=fergana&deal=sale&owner=owners&types=apartment")).toBe(true);
  });

  it("gives byte-equal addresses for equal states", () => {
    const reordered = { ...everything, zones: ["near_center", "center"], types: ["land", "apartment", "house"] };
    const a = toSearchParams(reordered as SearchFilters, "ppm");
    expect(a.toString()).toBe(toSearchParams(everything, "ppm").toString());
    expect(toSearchParams(roundTrip(everything, "ppm").filters, "ppm").toString()).toBe(a.toString());
  });

  it("ignores the reserved parameters: they never become filters", () => {
    const params = new URLSearchParams("from=map&focus=pets&pick=city&draw=1&pin=5&step=report&i=2");
    expect(fromSearchParams(params)).toEqual({ filters: defaultFilters(), sort: "new" });
  });

  it("never emits a reserved parameter", () => {
    const names = [...toSearchParams(everything, "ppm").keys()];
    for (const reserved of ["from", "focus", "pick", "draw", "pin", "step", "i"]) {
      expect(names).not.toContain(reserved);
    }
  });

  it("reads only the 25 keys and sort", () => {
    const params = new URLSearchParams("city=fergana&zone=center&types[]=house&utm_source=x&sort=cheap");
    expect(fromSearchParams(params)).toEqual({ filters: defaultFilters("rent_long", "fergana"), sort: "cheap" });
  });

  it("normalises garbage values", () => {
    const params = new URLSearchParams(
      "deal=barter&types=garage&rooms_min=two&price_max=-5&posted_days=5&near_metro=yes&furnished=perhaps" +
        "&zones=suburbs&tenant=students&polygon=1,2;3&sort=closest&city=%3Cb%3E",
    );
    expect(fromSearchParams(params)).toEqual({ filters: defaultFilters(), sort: "new" });
  });

  it("reads a polygon of 3 and of 40 vertices at 5 decimals", () => {
    for (const n of [3, 40]) {
      const polygon = ring(n);
      const params = toSearchParams({ ...defaultFilters(), polygon });
      expect(params.get("polygon")).toBe(serializePolygon(polygon));
      expect(fromSearchParams(params).filters.polygon).toEqual(polygon);
    }
    expect(fromSearchParams(toSearchParams({ ...defaultFilters(), polygon: ring(41) })).filters.polygon).toBeNull();
  });

  it("accepts the searchParams object of a Server Component and a query string", () => {
    expect(fromSearchParams({ city: "fergana", types: ["house", "room"], sort: ["cheap", "ppm"], from: "map" })).toEqual({
      filters: { ...defaultFilters("rent_long", "fergana"), types: ["house", "room"] },
      sort: "cheap",
    });
    expect(fromSearchParams("?city=fergana&deal=sale").filters).toEqual(defaultFilters("sale", "fergana"));
    expect(fromSearchParams({ city: undefined }).filters.city).toBe("tashkent");
  });

  it("BR-APP-010 an address with a city keeps it; without one the fallback city applies", () => {
    expect(fromSearchParams("city=fergana", { fallbackCity: "samarkand" }).filters.city).toBe("fergana");
    const state = fromSearchParams("deal=sale", { fallbackCity: "samarkand" });
    expect(state.filters).toEqual(defaultFilters("sale", "samarkand"));
  });

  it("BR-APP-010 the fallback city: the profile city, else the saved one, else Tashkent", () => {
    expect(cityFallback({ profile: "fergana", saved: "samarkand" })).toBe("fergana");
    expect(cityFallback({ profile: null, saved: "samarkand" })).toBe("samarkand");
    expect(cityFallback({ profile: "", saved: undefined })).toBe("tashkent");
    expect(cityFallback({})).toBe("tashkent");
  });
});
