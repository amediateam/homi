import { baseDeal, defaultFilters, isApartmentOnly, resolveRules, TYPES_BY_DEAL } from "./defaults";
import { normalizeFilters } from "./normalize";
import type { CityRef, CityStatsRef, Deal, Polygon, PropertyType, SearchFilters, SearchRules, Zone } from "./types";
import { ZONE_OPTIONS } from "./types";

/**
 * The rules of what a change does to the other filters (`03` §4). Each function takes a valid state and returns a
 * new, normalised one; none mutates its input.
 */

/**
 * The rent / sale switch (BR-APP-002): the new deal's defaults, keeping districts, zones and the polygon. A switch to
 * the same base deal (daily rent is rent) changes nothing.
 */
export function switchDeal(filters: SearchFilters, deal: Deal): SearchFilters {
  if (baseDeal(deal) === baseDeal(filters.deal)) {
    return filters;
  }
  return normalizeFilters({
    ...defaultFilters(deal, filters.city),
    districts: filters.districts,
    zones: filters.zones,
    polygon: filters.polygon,
  });
}

/**
 * Long-term / daily rent (BR-APP-003): keeps the types the term allows (else apartments — `normalizeFilters` keeps
 * only the types a deal offers), resets the price and `below_median`; daily rent also clears `tenant`, `pets` and
 * `pets_only`.
 */
export function switchRentTerm(filters: SearchFilters, term: "rent_long" | "rent_daily"): SearchFilters {
  if (filters.deal === term) {
    return filters;
  }
  const daily = term === "rent_daily";
  return normalizeFilters({
    ...filters,
    deal: term,
    price_min: null,
    price_max: null,
    below_median: false,
    tenant: daily ? null : filters.tenant,
    pets: daily ? false : filters.pets,
    pets_only: daily ? false : filters.pets_only,
  });
}

/**
 * A type chip (BR-APP-005): adds or removes the type; the last type cannot be removed; `below_median` survives only
 * for exactly `['apartment']`. A type the deal does not offer is not added.
 */
export function toggleType(filters: SearchFilters, type: PropertyType): SearchFilters {
  if (!TYPES_BY_DEAL[filters.deal].includes(type)) {
    return filters;
  }
  const toggled = filters.types.includes(type)
    ? filters.types.filter((item) => item !== type)
    : [...filters.types, type];
  const types = toggled.length > 0 ? toggled : [type];
  return normalizeFilters({
    ...filters,
    types,
    below_median: filters.below_median && isApartmentOnly({ types }),
  });
}

export type Geography =
  | { readonly polygon: Polygon | null }
  | { readonly zones: readonly Zone[] }
  | { readonly districts: readonly string[] };

/**
 * One geography mode (BR-APP-008): a drawn polygon, zones or districts; setting one clears the other two. Zones keep
 * the order `center, near_center`; `near_metro` is independent.
 */
export function setGeography(filters: SearchFilters, geography: Geography): SearchFilters {
  return normalizeFilters({
    ...filters,
    polygon: "polygon" in geography ? geography.polygon : null,
    zones: "zones" in geography ? geography.zones : [],
    districts: "districts" in geography ? geography.districts : [],
  });
}

/** A zone chip (BR-APP-008): toggles the zone, keeps the canonical order, clears districts and the polygon. */
export function toggleZone(filters: SearchFilters, zone: Zone): SearchFilters {
  const on = (code: Zone) => (code === zone ? !filters.zones.includes(code) : filters.zones.includes(code));
  return setGeography(filters, { zones: ZONE_OPTIONS.filter(on) });
}

/** A district chip (BR-APP-008): appends or removes the district, clears zones and the polygon. */
export function toggleDistrict(filters: SearchFilters, district: string): SearchFilters {
  const districts = filters.districts.includes(district)
    ? filters.districts.filter((code) => code !== district)
    : [...filters.districts, district];
  return setGeography(filters, { districts });
}

/**
 * A city change (BR-APP-009): clears districts and the polygon; keeps zones only if the city has zones, `near_metro`
 * only with a metro, `below_median` only with medians. A missing mark counts as `false` (fix of LB-APP-007). The
 * current city changes nothing.
 */
export function pickCity(filters: SearchFilters, city: CityRef): SearchFilters {
  if (city.code === filters.city) {
    return filters;
  }
  return normalizeFilters({
    ...filters,
    city: city.code,
    districts: [],
    polygon: null,
    zones: (city.zones?.length ?? 0) > 0 ? filters.zones : [],
    near_metro: city.has_metro === true && filters.near_metro,
    below_median: city.has_median === true && filters.below_median,
  });
}

/**
 * «Сбросить» of the full sheet (BR-APP-022): the defaults of the base deal and the city (`city`, else the filters'
 * own). Legacy leaves daily rent for long rent (LB-APP-030); `dev018ResetKeepsDaily` keeps daily rent.
 */
export function resetAll(
  filters: SearchFilters,
  city: string | null = null,
  rules: Partial<SearchRules> = {},
): SearchFilters {
  const deal = resolveRules(rules).dev018ResetKeepsDaily ? filters.deal : baseDeal(filters.deal);
  return defaultFilters(deal, city ?? filters.city);
}

export type QuickFilter = "rooms" | "price" | "owner";

/** The reset of a quick sheet (BR-APP-022): only its own filter; the price also clears `below_median`. */
export function resetQuick(filters: SearchFilters, kind: QuickFilter): SearchFilters {
  switch (kind) {
    case "rooms":
      return normalizeFilters({ ...filters, rooms_min: null, rooms_max: null });
    case "price":
      return normalizeFilters({ ...filters, price_min: null, price_max: null, below_median: false });
    case "owner":
      return normalizeFilters({ ...filters, owner: "any" });
  }
}

/**
 * A price preset chip «до N» (BR-APP-014): sets `price_max` and clears `price_min`; tapping the preset that is the
 * current maximum clears the price.
 */
export function applyPreset(filters: SearchFilters, usd: number): SearchFilters {
  return normalizeFilters({ ...filters, price_min: null, price_max: filters.price_max === usd ? null : usd });
}

/** A preset chip shows as selected only when it is the maximum and there is no minimum (BR-APP-014). */
export function isPresetSelected(filters: Pick<SearchFilters, "price_min" | "price_max">, usd: number): boolean {
  return filters.price_max === usd && filters.price_min === null;
}

/**
 * The USD presets of a deal (BR-APP-014): the city's presets of `GET /cities` when it has any, else the reference
 * presets of `GET /reference`. `fromCity` tells the money formatter which list it converts (BR-APP-015).
 */
export function presetSource(
  deal: Deal,
  stats: CityStatsRef | null | undefined,
  reference: Readonly<Partial<Record<Deal, readonly number[]>>> | null | undefined,
): { values: readonly number[]; fromCity: boolean } {
  const city = stats?.price_presets?.[deal] ?? [];
  if (city.length > 0) {
    return { values: city, fromCity: true };
  }
  return { values: reference?.[deal] ?? [], fromCity: false };
}
