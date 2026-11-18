import { describe, expect, it } from "vitest";

import { countActiveFilters, filtersHash, filtersKey, isCustomFilters, sameFilters } from "../src/compare";
import { defaultFilters } from "../src/defaults";
import type { SearchFilters } from "../src/types";

const base = defaultFilters();
const triangle = [
  [41.3, 69.2],
  [41.31, 69.25],
  [41.29, 69.3],
] as const;

describe("filtersKey / sameFilters", () => {
  it("BR-APP-012 ignores posted_days, so a radar matches the search it was made from", () => {
    expect(filtersKey({ ...base, posted_days: 7 })).toBe(filtersKey(base));
    expect(sameFilters({ ...base, posted_days: 7 }, base)).toBe(true);
  });

  it("BR-APP-012 fills missing keys from the defaults and defaults the city to Tashkent", () => {
    expect(filtersKey({ deal: "rent_long" })).toBe(filtersKey(base));
    expect(sameFilters({ deal: "sale", city: "fergana" }, defaultFilters("sale", "fergana"))).toBe(true);
  });

  it("BR-APP-012 sorts list values, so the order of a selection does not matter", () => {
    expect(
      sameFilters(
        { ...base, districts: ["yunusabad", "chilanzar"], types: ["room", "apartment"] },
        { ...base, districts: ["chilanzar", "yunusabad"], types: ["apartment", "room"] },
      ),
    ).toBe(true);
    expect(sameFilters({ ...base, polygon: triangle }, { ...base, polygon: [triangle[2], triangle[0], triangle[1]] })).toBe(
      true,
    );
  });

  it("BR-APP-012 tells different filters apart", () => {
    expect(sameFilters(base, { ...base, near_metro: true })).toBe(false);
    expect(sameFilters(base, { ...base, city: "fergana" })).toBe(false);
    expect(sameFilters(base, { ...base, furnished: false })).toBe(false);
    expect(sameFilters(base, { ...base, rooms_min: 2, rooms_max: 2 })).toBe(false);
  });

  it("LB-APP-007 a city change that leaves near_metro undefined still equals the defaults", () => {
    // Legacy: `picked.metro && filters.near_metro` is `undefined`, which `filtersKey` turned into `null` ≠ `false`.
    expect(filtersKey({ ...base, near_metro: undefined, below_median: undefined })).toBe(filtersKey(base));
  });

  it("is a plain string with sorted keys", () => {
    const key = filtersKey(base);
    expect(typeof key).toBe("string");
    const names = (JSON.parse(key) as [string, unknown][]).map(([name]) => name);
    expect(names).toEqual([...names].sort());
    expect(names).toHaveLength(25);
  });
});

/** The same djb2 in another arithmetic: `h * 33 + code` modulo 2^32, so an int32 slip of `filtersHash` shows. */
function referenceHash(key: string): string {
  let hash = 5381;
  for (const unit of Array.from({ length: key.length }, (_, index) => key.charCodeAt(index))) {
    hash = (hash * 33 + unit) % 2 ** 32;
  }
  return hash.toString(36);
}

describe("filtersHash (WP-30, the nudge and visit records)", () => {
  it("equal searches give one hash: posted_days, missing keys and list order do not count", () => {
    expect(filtersHash({ ...base, posted_days: 7 })).toBe(filtersHash(base));
    expect(filtersHash({ deal: "rent_long" })).toBe(filtersHash(base));
    expect(filtersHash({ ...base, districts: ["yunusabad", "chilanzar"] })).toBe(filtersHash({ ...base, districts: ["chilanzar", "yunusabad"] }));
  });

  it("different searches give different hashes", () => {
    const hashes = new Set([base, defaultFilters("sale"), { ...base, near_metro: true }, { ...base, city: "fergana" }].map(filtersHash));
    expect(hashes.size).toBe(4);
  });

  it("is djb2 of filtersKey, unsigned, in base 36, and stable", () => {
    expect(filtersHash(base)).toBe(referenceHash(filtersKey(base)));
    expect(filtersHash(defaultFilters("sale", "fergana"))).toBe(referenceHash(filtersKey(defaultFilters("sale", "fergana"))));
    expect(filtersHash(base)).toMatch(/^[0-9a-z]{1,7}$/);
    expect(filtersHash(base)).toBe("19lfhk");
    expect(filtersHash(defaultFilters("sale", "fergana"))).toBe("1yu99av");
  });
});

describe("isCustomFilters", () => {
  it("BR-APP-013 the defaults of a deal and city are not custom", () => {
    expect(isCustomFilters(base)).toBe(false);
    expect(isCustomFilters(defaultFilters("sale", "fergana"))).toBe(false);
  });

  it("BR-APP-013 daily rent is custom: it differs from the defaults of its base deal", () => {
    expect(isCustomFilters(defaultFilters("rent_daily"))).toBe(true);
  });

  it("BR-APP-013 any changed filter is custom, posted_days alone is not", () => {
    expect(isCustomFilters({ ...base, price_max: 600 })).toBe(true);
    expect(isCustomFilters({ ...base, posted_days: 3 })).toBe(false);
  });

  it("LB-APP-007 undefined booleans after a city change are not custom (no follow nudge)", () => {
    expect(isCustomFilters({ ...defaultFilters("rent_long", "fergana"), near_metro: undefined })).toBe(false);
  });
});

describe("countActiveFilters", () => {
  const groups: [string, Partial<Record<keyof SearchFilters, unknown>>][] = [
    ["daily", { deal: "rent_daily" }],
    ["non-apartment types", { types: ["apartment", "house"] }],
    ["rooms (min)", { rooms_min: 2 }],
    ["rooms (max)", { rooms_max: 3 }],
    ["price (min)", { price_min: 100 }],
    ["price (max)", { price_max: 600 }],
    ["geography: districts", { districts: ["yunusabad"] }],
    ["geography: zones", { zones: ["center"] }],
    ["geography: polygon", { polygon: triangle }],
    ["metro", { near_metro: true }],
    ["below median", { below_median: true }],
    ["owner", { owner: "owners" }],
    ["tenant", { tenant: "family" }],
    ["pets", { pets: true }],
    ["pets only", { pets_only: true }],
    ["furnished (yes)", { furnished: true }],
    ["furnished (no)", { furnished: false }],
    ["renovation", { renovation: ["euro"] }],
    ["floor: not first", { floor_not_first: true }],
    ["floor: not last", { floor_not_last: true }],
    ["area", { deal: "sale", area_min: 40 }],
    ["market", { deal: "sale", market: "new" }],
    ["appliances", { appliances: ["washer"] }],
    ["posted days", { posted_days: 3 }],
  ];

  it("BR-APP-011 the defaults count zero", () => {
    expect(countActiveFilters(base)).toBe(0);
    expect(countActiveFilters(defaultFilters("sale"))).toBe(0);
  });

  it.each(groups)("BR-APP-011 counts the group %s once", (_, patch) => {
    expect(countActiveFilters({ ...base, ...patch })).toBe(1);
  });

  it("BR-APP-011 counts a group once however many of its filters are set", () => {
    expect(countActiveFilters({ ...base, rooms_min: 1, rooms_max: 3, price_min: 1, price_max: 9 })).toBe(2);
    expect(countActiveFilters({ ...base, floor_not_first: true, floor_not_last: true })).toBe(1);
    expect(countActiveFilters({ ...base, zones: ["center"], districts: ["yunusabad"] })).toBe(1);
  });

  it("BR-APP-011 does not count pets for sale", () => {
    expect(countActiveFilters({ ...defaultFilters("sale"), pets: true })).toBe(0);
    expect(countActiveFilters({ ...defaultFilters("sale"), pets_only: true })).toBe(0);
  });

  it("BR-APP-011 adds up the groups", () => {
    expect(
      countActiveFilters({ ...base, deal: "rent_daily", near_metro: true, owner: "no_agents", price_max: 50 }),
    ).toBe(4);
  });
});
