import type { BaseDeal, Deal, ListingSort, PropertyType, SearchFilters, SearchRules } from "./types";

export const DEFAULT_CITY = "tashkent";
export const DEFAULT_DEAL: Deal = "rent_long";
export const DEFAULT_SORT: ListingSort = "new";

/** The behaviour of the pinned legacy release (DEC-58, amending DEC-36): only what legacy has adopted is on. */
export const DEFAULT_RULES: SearchRules = Object.freeze({
  dev017TenantPetsDailyRule: false,
  dev017PetsLongRentOnly: true,
  dev018ResetKeepsDaily: false,
  dev025ValidateRanges: false,
  dev052UnifiedBelowMedianRule: false,
  dev005RadarDropsPostedDays: false,
});

/** The rules with every member the caller left out switched off. */
export function resolveRules(rules: Partial<SearchRules> = {}): SearchRules {
  return { ...DEFAULT_RULES, ...rules };
}

/** The property types each deal offers, in the order the chips show them (BR-APP-005). */
export const TYPES_BY_DEAL: Readonly<Record<Deal, readonly PropertyType[]>> = Object.freeze({
  rent_long: ["apartment", "house", "room", "commercial"],
  rent_daily: ["apartment", "house", "room"],
  sale: ["apartment", "house", "commercial", "land"],
});

/** Types for which the rooms filter means nothing (BR-APP-006). */
export const NO_ROOMS_TYPES: ReadonlySet<PropertyType> = new Set<PropertyType>(["room", "commercial", "land"]);

/**
 * The defaults of a deal and a city (BR-APP-001): apartments, any owner, every list empty, everything else `null`
 * or `false`. The keys come in the order of `FILTER_KEYS`.
 */
export function defaultFilters(deal: Deal = DEFAULT_DEAL, city: string = DEFAULT_CITY): SearchFilters {
  return {
    city,
    deal,
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
  };
}

/** The deal of the rent / sale switch: daily rent counts as rent. */
export function baseDeal(deal: Deal): BaseDeal {
  return deal === "sale" ? "sale" : "rent_long";
}

/** The types are exactly `['apartment']`. */
export function isApartmentOnly(filters: Pick<SearchFilters, "types">): boolean {
  return filters.types.length === 1 && filters.types[0] === "apartment";
}

/** An apartment-only search that is not daily rent: the one that offers medians (BR-APP-017, BR-APP-023). */
export function isApartmentSearch(filters: Pick<SearchFilters, "deal" | "types">): boolean {
  return filters.deal !== "rent_daily" && isApartmentOnly(filters);
}
