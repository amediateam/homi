import { describe, expect, it } from "vitest";

import { defaultFilters } from "../src/defaults";
import { normalizeFilters } from "../src/normalize";

describe("normalizeFilters", () => {
  it("fills missing keys from the defaults of the input's deal", () => {
    expect(normalizeFilters({ deal: "sale", city: "fergana" })).toEqual(defaultFilters("sale", "fergana"));
    expect(normalizeFilters({})).toEqual(defaultFilters());
    expect(normalizeFilters(null)).toEqual(defaultFilters());
    expect(normalizeFilters("garbage")).toEqual(defaultFilters());
  });

  it("uses the fallback city only when the input has none", () => {
    expect(normalizeFilters({}, { fallbackCity: "fergana" }).city).toBe("fergana");
    expect(normalizeFilters({ city: "samarkand" }, { fallbackCity: "fergana" }).city).toBe("samarkand");
    expect(normalizeFilters({ city: "" }, { fallbackCity: "fergana" }).city).toBe("fergana");
    expect(normalizeFilters({ city: "<b>" }).city).toBe("tashkent");
  });

  it("LB-APP-007 turns undefined into the default, never into undefined or null", () => {
    const filters = normalizeFilters({
      ...defaultFilters(),
      near_metro: undefined,
      below_median: undefined,
      pets: undefined,
      types: undefined,
      zones: undefined,
    });
    expect(filters).toEqual(defaultFilters());
    expect(Object.values(filters)).not.toContain(undefined);
  });

  it("coerces booleans", () => {
    const filters = normalizeFilters({
      near_metro: "1",
      below_median: "true",
      pets: 1,
      floor_not_first: "yes",
      floor_not_last: 0,
    });
    expect(filters.near_metro).toBe(true);
    expect(filters.below_median).toBe(true);
    expect(filters.pets).toBe(true);
    expect(filters.floor_not_first).toBe(false);
    expect(filters.floor_not_last).toBe(false);
  });

  it("keeps furnished three-state", () => {
    expect(normalizeFilters({ furnished: true }).furnished).toBe(true);
    expect(normalizeFilters({ furnished: "1" }).furnished).toBe(true);
    expect(normalizeFilters({ furnished: false }).furnished).toBe(false);
    expect(normalizeFilters({ furnished: "0" }).furnished).toBe(false);
    expect(normalizeFilters({ furnished: "maybe" }).furnished).toBeNull();
    expect(normalizeFilters({ furnished: undefined }).furnished).toBeNull();
  });

  it("reads numeric strings and keeps numbers finite integers in the contract's bounds, else null", () => {
    const filters = normalizeFilters({
      rooms_min: "2",
      rooms_max: 11,
      price_min: "0",
      price_max: "600",
      area_min: 2.5,
      area_max: Number.POSITIVE_INFINITY,
      posted_days: "7",
    });
    expect(filters.rooms_min).toBe(2);
    expect(filters.rooms_max).toBeNull();
    expect(filters.price_min).toBeNull();
    expect(filters.price_max).toBe(600);
    expect(filters.area_min).toBeNull();
    expect(filters.area_max).toBeNull();
    expect(filters.posted_days).toBe(7);
    expect(normalizeFilters({ posted_days: 5 }).posted_days).toBeNull();
    expect(normalizeFilters({ price_max: "1e3" }).price_max).toBeNull();
    expect(normalizeFilters({ area_max: 10001 }).area_max).toBeNull();
    expect(normalizeFilters({ rooms_min: 0 }).rooms_min).toBe(0);
  });

  it("keeps lists as lists of codes without repeats", () => {
    const filters = normalizeFilters({
      districts: "yunusabad",
      renovation: ["euro", "euro", 3, "", "cosmetic"],
      appliances: { washer: true },
    });
    expect(filters.districts).toEqual(["yunusabad"]);
    expect(filters.renovation).toEqual(["euro", "cosmetic"]);
    expect(filters.appliances).toEqual([]);
  });

  it("keeps the types the deal offers, in the deal's order, else apartments", () => {
    expect(normalizeFilters({ types: ["room", "apartment"] }).types).toEqual(["apartment", "room"]);
    expect(normalizeFilters({ deal: "rent_daily", types: ["commercial"] }).types).toEqual(["apartment"]);
    expect(normalizeFilters({ deal: "sale", types: ["land", "room"] }).types).toEqual(["land"]);
    expect(normalizeFilters({ types: [] }).types).toEqual(["apartment"]);
  });

  it("puts zones in the canonical order and drops unknown zones", () => {
    expect(normalizeFilters({ zones: ["near_center", "center"] }).zones).toEqual(["center", "near_center"]);
    expect(normalizeFilters({ zones: ["near_center", "suburbs"] }).zones).toEqual(["near_center"]);
  });

  it("closes enums: an unknown value becomes the default", () => {
    const filters = normalizeFilters({ deal: "barter", owner: "nobody", tenant: "students", market: "old" });
    expect(filters.deal).toBe("rent_long");
    expect(filters.owner).toBe("any");
    expect(filters.tenant).toBeNull();
    expect(filters.market).toBeNull();
    expect(normalizeFilters({ tenant: "family", market: "new", owner: "owners" })).toMatchObject({
      tenant: "family",
      market: "new",
      owner: "owners",
    });
  });

  it("lets pets_only win over pets, as the server does", () => {
    const filters = normalizeFilters({ pets: true, pets_only: true });
    expect(filters.pets).toBe(false);
    expect(filters.pets_only).toBe(true);
  });

  it("drops unknown keys", () => {
    const filters = normalizeFilters({
      zone: "center",
      from: "map",
      sort: "cheap",
      __proto__: { city: "inherited", near_metro: true },
    });
    expect(filters).toEqual(defaultFilters());
    expect(Object.keys(filters)).toHaveLength(25);
  });

  it("drops a polygon under 3 points and keeps one of 3, rounded to 5 decimals", () => {
    expect(
      normalizeFilters({
        polygon: [
          [41.3, 69.2],
          [41.31, 69.25],
        ],
      }).polygon,
    ).toBeNull();
    expect(
      normalizeFilters({
        polygon: [
          [41.123456789, 69.2],
          [41.31, 69.25],
          [41.29, 69.3],
        ],
      }).polygon,
    ).toEqual([
      [41.12346, 69.2],
      [41.31, 69.25],
      [41.29, 69.3],
    ]);
  });

  it("does not resolve geography modes: a server radar keeps what it sent", () => {
    const filters = normalizeFilters({
      zones: ["center"],
      districts: ["yunusabad"],
      polygon: "41.3,69.2;41.31,69.25;41.29,69.3",
    });
    expect(filters.zones).toEqual(["center"]);
    expect(filters.districts).toEqual(["yunusabad"]);
    expect(filters.polygon).toHaveLength(3);
  });

  it("is idempotent", () => {
    const once = normalizeFilters({ deal: "sale", types: ["land", "house"], zones: ["near_center", "center"] });
    expect(normalizeFilters(once)).toEqual(once);
  });
});
