import { baseDeal, isApartmentOnly, isApartmentSearch, NO_ROOMS_TYPES, resolveRules } from "./defaults";
import type { CityRef, CityStatsRef, SearchFilters, SearchMode, SearchRules } from "./types";

/** Which parts of a filters sheet are offered for a filter set, a city and a mode. */
export type Sections = {
  /** BR-APP-004: long-term / daily rent. */
  readonly rentTerm: boolean;
  /** BR-APP-006. */
  readonly rooms: boolean;
  /** BR-APP-016: «Половина квартир — до X», the USD amount to show, or `null` when the line is hidden. */
  readonly typicalPrice: number | null;
  /** BR-APP-018: «Цена за сотку или м²…». */
  readonly unitPriceHint: boolean;
  /** BR-APP-017: «Не дороже рынка». */
  readonly belowMedian: boolean;
  /** BR-APP-019 (LB-APP-029 behind `dev017TenantPetsDailyRule`). */
  readonly tenant: boolean;
  readonly pets: boolean;
  /** BR-APP-020. */
  readonly area: boolean;
  readonly market: boolean;
  readonly appliances: boolean;
  /** BR-APP-021: «Опубликовано за 1 / 3 / 7 дней». */
  readonly posted: boolean;
};

/**
 * The «Не дороже рынка» chip (BR-APP-017): a non-daily, apartment-only search in a city with medians. A city
 * without the mark, or no city yet, has none. `dev052UnifiedBelowMedianRule` has no effect until DEV-052 is
 * approved.
 */
export function belowMedianAvailable(
  filters: Pick<SearchFilters, "deal" | "types">,
  city: CityRef | null | undefined,
  rules: Partial<SearchRules> = {},
): boolean {
  void rules;
  return isApartmentSearch(filters) && city?.has_median === true;
}

/**
 * The sections of the filters sheet for `filters` in `city` (`null` while the reference data loads) and `mode`.
 * `stats` is the city's entry of `GET /cities` (daily count, typical prices).
 */
export function sectionsFor(
  filters: SearchFilters,
  city: CityRef | null | undefined,
  mode: SearchMode,
  rules: Partial<SearchRules> = {},
  stats: CityStatsRef | null = null,
): Sections {
  const resolved = resolveRules(rules);
  const rent = baseDeal(filters.deal) === "rent_long";
  const daily = filters.deal === "rent_daily";
  const sale = filters.deal === "sale";
  const typical = stats?.typical_price?.[filters.deal];
  const tenantAndPets = rent && !(resolved.dev017TenantPetsDailyRule && daily);
  return {
    rentTerm: rent && (daily || (stats?.counts?.rent_daily ?? 0) > 0),
    rooms: !filters.types.every((type) => NO_ROOMS_TYPES.has(type)),
    typicalPrice:
      isApartmentOnly(filters) && Boolean(city?.name) && typeof typical === "number" && Number.isFinite(typical)
        ? typical
        : null,
    unitPriceHint: sale && filters.types.some((type) => type === "land" || type === "house"),
    belowMedian: belowMedianAvailable(filters, city, resolved),
    tenant: tenantAndPets,
    pets: tenantAndPets,
    area: sale,
    market: sale,
    appliances: rent,
    posted: mode === "search",
  };
}

/**
 * Inverted price and area ranges (LB-APP-043). Legacy sends them as typed, so with `dev025ValidateRanges` off the
 * input is returned unchanged; on, the bounds are swapped.
 */
export function fixRanges(filters: SearchFilters, rules: Partial<SearchRules> = {}): SearchFilters {
  if (!resolveRules(rules).dev025ValidateRanges) {
    return filters;
  }
  const swap = (min: number | null, max: number | null): [number | null, number | null] =>
    min !== null && max !== null && min > max ? [max, min] : [min, max];
  const [price_min, price_max] = swap(filters.price_min, filters.price_max);
  const [area_min, area_max] = swap(filters.area_min, filters.area_max);
  return { ...filters, price_min, price_max, area_min, area_max };
}
