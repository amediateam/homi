import { describe, expect, it } from "vitest";

import { toApiQuery } from "../src/api";
import { defaultFilters } from "../src/defaults";
import { toRadarFilters } from "../src/radar";
import type { SearchFilters } from "../src/types";

const triangle = [
  [41.3, 69.2],
  [41.31, 69.25],
  [41.29, 69.3],
] as const;

describe("toApiQuery", () => {
  it("sends city and deal always, lists as repeated name[] parameters, booleans as true", () => {
    const query = toApiQuery({
      ...defaultFilters("rent_long", "tashkent"),
      types: ["apartment", "house"],
      districts: ["yunusabad"],
      near_metro: true,
      furnished: false,
      price_max: 600,
    });
    expect(query.toString()).toBe(
      "city=tashkent&deal=rent_long&owner=any&types%5B%5D=apartment&types%5B%5D=house&districts%5B%5D=yunusabad" +
        "&price_max=600&furnished=false&near_metro=true",
    );
    expect(query.getAll("types[]")).toEqual(["apartment", "house"]);
  });

  it("omits null, false and empty values", () => {
    expect(toApiQuery(defaultFilters("sale", "fergana")).toString()).toBe(
      "city=fergana&deal=sale&owner=any&types%5B%5D=apartment",
    );
  });

  it("writes the polygon as lat,lon pairs with 5 decimals", () => {
    expect(toApiQuery({ ...defaultFilters(), polygon: triangle }).get("polygon")).toBe(
      "41.30000,69.20000;41.31000,69.25000;41.29000,69.30000",
    );
  });

  it("BR-APP-023 never sends the sort new; sends any other sort, the cursor and the limit", () => {
    expect(toApiQuery(defaultFilters(), { sort: "new" }).has("sort")).toBe(false);
    const query = toApiQuery(defaultFilters(), { sort: "cheap", cursor: "abc", limit: 20 });
    expect(query.get("sort")).toBe("cheap");
    expect(query.get("cursor")).toBe("abc");
    expect(query.get("limit")).toBe("20");
    expect(query.toString().endsWith("&sort=cheap&cursor=abc&limit=20")).toBe(true);
  });

  it("drops a limit outside 1 … 50 and an empty cursor", () => {
    const query = toApiQuery(defaultFilters(), { cursor: "", limit: 100 });
    expect(query.has("cursor")).toBe(false);
    expect(query.has("limit")).toBe(false);
  });

  it("normalises its input: no undefined reaches the query", () => {
    const loose = { ...defaultFilters(), near_metro: undefined, rooms_min: undefined } as unknown as SearchFilters;
    const query = toApiQuery(loose);
    expect(query.toString()).not.toContain("undefined");
    expect(query.has("near_metro")).toBe(false);
  });

  it("gives the same query for equal states", () => {
    const a = toApiQuery({ ...defaultFilters(), zones: ["near_center", "center"], types: ["room", "apartment"] });
    const b = toApiQuery({ ...defaultFilters(), types: ["apartment", "room"], zones: ["center", "near_center"] });
    expect(a.toString()).toBe(b.toString());
  });

  it("LB-APP-043 dev025ValidateRanges off (legacy): an inverted price range is sent as typed", () => {
    const query = toApiQuery({ ...defaultFilters(), price_min: 900, price_max: 100 });
    expect([query.get("price_min"), query.get("price_max")]).toEqual(["900", "100"]);
  });

  it("LB-APP-043 dev025ValidateRanges on: an inverted range is sent swapped", () => {
    const query = toApiQuery(
      { ...defaultFilters("sale"), price_min: 900, price_max: 100, area_min: 90, area_max: 30 },
      { rules: { dev025ValidateRanges: true } },
    );
    expect([query.get("price_min"), query.get("price_max")]).toEqual(["100", "900"]);
    expect([query.get("area_min"), query.get("area_max")]).toEqual(["30", "90"]);
  });
});

describe("toRadarFilters", () => {
  const filters: SearchFilters = {
    ...defaultFilters("rent_long", "tashkent"),
    types: ["apartment", "room"],
    near_metro: true,
    posted_days: 3,
    polygon: triangle,
  };

  it("gives the 25 keys of the radar body's filters object with JSON values", () => {
    const body = toRadarFilters(filters);
    expect(Object.keys(body)).toHaveLength(25);
    expect(body).toMatchObject({
      city: "tashkent",
      deal: "rent_long",
      types: ["apartment", "room"],
      near_metro: true,
      furnished: null,
      polygon: [
        [41.3, 69.2],
        [41.31, 69.25],
        [41.29, 69.3],
      ],
    });
    expect(JSON.parse(JSON.stringify(body))).toEqual(body);
  });

  it("dev005RadarDropsPostedDays off (legacy): keeps posted_days", () => {
    expect(toRadarFilters(filters).posted_days).toBe(3);
    expect(toRadarFilters(filters, { dev005RadarDropsPostedDays: false }).posted_days).toBe(3);
  });

  it("dev005RadarDropsPostedDays on: sets posted_days to null", () => {
    expect(toRadarFilters(filters, { dev005RadarDropsPostedDays: true })).toEqual({
      ...toRadarFilters(filters),
      posted_days: null,
    });
  });

  it("LB-APP-043 dev025ValidateRanges on swaps an inverted range in the radar body; off keeps it", () => {
    const inverted = { ...filters, price_min: 900, price_max: 100 };
    expect(toRadarFilters(inverted)).toMatchObject({ price_min: 900, price_max: 100 });
    expect(toRadarFilters(inverted, { dev025ValidateRanges: true })).toMatchObject({ price_min: 100, price_max: 900 });
  });

  it("normalises its input", () => {
    const body = toRadarFilters({ ...filters, below_median: undefined } as unknown as SearchFilters);
    expect(body.below_median).toBe(false);
    expect(Object.values(body)).not.toContain(undefined);
  });
});
