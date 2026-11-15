import { DEFAULT_SORT, isApartmentSearch } from "./defaults";
import { type CityRef, LISTING_SORTS, type ListingSort, type SearchFilters } from "./types";

/**
 * The sorts offered for a filter set in a city (BR-APP-023): `new`, `cheap`, `expensive` always; `deal` for a
 * non-daily apartment-only search in a city with medians; `center` in a city with zones; `ppm` for a sale. Before
 * the reference data arrives (`city` is `null`) only the three basic sorts are offered (fix of LB-APP-023), and a
 * city without a `zones` or `has_median` field offers neither `center` nor `deal`.
 */
export function sortOptions(
  filters: Pick<SearchFilters, "deal" | "types">,
  city: CityRef | null | undefined,
): ListingSort[] {
  const options: ListingSort[] = ["new", "cheap", "expensive"];
  if (!city) {
    return options;
  }
  if (isApartmentSearch(filters) && city.has_median === true) {
    options.push("deal");
  }
  if ((city.zones?.length ?? 0) > 0) {
    options.push("center");
  }
  if (filters.deal === "sale") {
    options.push("ppm");
  }
  return options;
}

/** A known sort, else `new`. */
export function parseSort(value: unknown): ListingSort {
  return LISTING_SORTS.find((sort) => sort === value) ?? DEFAULT_SORT;
}

/** The sort if it is offered, else `new` (BR-APP-023). */
export function normalizeSort(sort: unknown, options: readonly ListingSort[]): ListingSort {
  const parsed = parseSort(sort);
  return options.includes(parsed) ? parsed : DEFAULT_SORT;
}
