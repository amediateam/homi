import { DEFAULT_CITY, DEFAULT_DEAL, DEFAULT_SORT, defaultFilters } from "./defaults";
import { normalizeFilters } from "./normalize";
import { serializePolygon } from "./polygon";
import { parseSort } from "./sort";
import { FILTER_KEYS, type FilterKey, type ListingSort, type SearchFilters } from "./types";

/** The only parameters of the address this package reads or writes: the 25 keys and `sort`. */
export const SEARCH_PARAM_KEYS = [...FILTER_KEYS, "sort"] as const;

/**
 * An address query in any of the shapes the app holds: `URLSearchParams`, a query string, or the `searchParams`
 * object of a Server Component.
 */
export type SearchParamsInput =
  | URLSearchParams
  | string
  | Readonly<Record<string, string | readonly string[] | undefined>>;

export type SearchState = {
  readonly filters: SearchFilters;
  readonly sort: ListingSort;
};

const LIST_KEYS: ReadonlySet<FilterKey> = new Set(["types", "districts", "renovation", "appliances", "zones"]);

function values(input: SearchParamsInput): (key: string) => string[] {
  if (typeof input === "string" || input instanceof URLSearchParams) {
    const params = typeof input === "string" ? new URLSearchParams(input) : input;
    return (key) => params.getAll(key);
  }
  return (key) => {
    const value = Object.hasOwn(input, key) ? input[key] : undefined;
    if (typeof value === "string") {
      return [value];
    }
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  };
}

function written(filters: SearchFilters, key: FilterKey): string[] {
  if (key === "polygon") {
    return filters.polygon === null ? [] : [serializePolygon(filters.polygon)];
  }
  const value = filters[key];
  if (value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "boolean") {
    return [value ? "1" : "0"];
  }
  return [String(value)];
}

/**
 * The address of a search state (`25` §3.2): each key under its own name — lists as repeated parameters, booleans as
 * `1` (`furnished` `1` or `0`), the polygon as `lat,lon;…` with 5 decimals. Values equal to the default of the deal
 * are omitted, and so are `deal=rent_long` and `sort=new`; `city` is always written. The keys follow `FILTER_KEYS`
 * and the input is normalised first, so equal states give byte-equal addresses. Reserved parameters of the app
 * (`from`, `focus`, …) are never written: the caller merges these parameters with its own.
 */
export function toSearchParams(filters: SearchFilters, sort: ListingSort = DEFAULT_SORT): URLSearchParams {
  const f = normalizeFilters(filters);
  const defaults = defaultFilters(f.deal, f.city);
  const params = new URLSearchParams();
  const isDefault = (key: FilterKey) => {
    if (key === "city") {
      return false;
    }
    return key === "deal" ? f.deal === DEFAULT_DEAL : JSON.stringify(f[key]) === JSON.stringify(defaults[key]);
  };
  for (const key of FILTER_KEYS) {
    if (!isDefault(key)) {
      for (const value of written(f, key)) {
        params.append(key, value);
      }
    }
  }
  const parsed = parseSort(sort);
  if (parsed !== DEFAULT_SORT) {
    params.append("sort", parsed);
  }
  return params;
}

/**
 * The search state of an address: reads only the 25 keys and `sort` (everything else, the reserved parameters
 * `from`, `focus`, `pick`, `draw`, `pin`, `step`, `i` included, is ignored) and passes the result through
 * `normalizeFilters`, so a hand-edited address cannot produce an invalid state. A missing city takes `fallbackCity`
 * (BR-APP-010: an address that carries a city keeps it). The sort is a known one or `new`; whether the city offers
 * it is `normalizeSort`'s question.
 */
export function fromSearchParams(
  params: SearchParamsInput,
  options: { readonly fallbackCity?: string | null } = {},
): SearchState {
  const read = values(params);
  const raw: Record<string, unknown> = {};
  for (const key of FILTER_KEYS) {
    raw[key] = LIST_KEYS.has(key) ? read(key) : read(key)[0];
  }
  return {
    filters: normalizeFilters(raw, { fallbackCity: options.fallbackCity }),
    sort: parseSort(read("sort")[0]),
  };
}

/**
 * The city of a search whose address has none (BR-APP-001, BR-APP-010): the profile's city (`me.city`), else the
 * saved one (`homi-city`), else Tashkent.
 */
export function cityFallback(sources: { readonly profile?: string | null; readonly saved?: string | null }): string {
  return sources.profile || sources.saved || DEFAULT_CITY;
}
