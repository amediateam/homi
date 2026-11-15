import { fixRanges } from "./availability";
import { DEFAULT_SORT } from "./defaults";
import { normalizeFilters } from "./normalize";
import { serializePolygon } from "./polygon";
import { parseSort } from "./sort";
import { FILTER_KEYS, type ListingSort, type SearchFilters, type SearchRules } from "./types";

/** The page size bounds of `GET /listings` (`limit`, 1 … 50) and the longest cursor it accepts. */
export const API_LIMIT_RANGE = [1, 50] as const;
const CURSOR_MAX_LENGTH = 512;

export type ApiQueryOptions = {
  readonly sort?: ListingSort | null;
  readonly cursor?: string | null;
  readonly limit?: number | null;
  readonly rules?: Partial<SearchRules>;
};

/**
 * The query of the listing methods of `/api/v1` (WP-12: `GET /listings`, `/listings/count`, `/listings/new`,
 * `/listings/flow`, `/listings/map`; `docs/api/README.md` «Listings»): `city` and `deal` always; lists as repeated
 * `name[]` parameters; booleans as `true` and only when set, `furnished` as `true` or `false`; the polygon as
 * `lat,lon;…` with 5 decimals; `null`, `false` and empty lists omitted. Then `sort` (never `new`), `cursor` and
 * `limit` when given. The keys follow `FILTER_KEYS`; inverted ranges are swapped only with `dev025ValidateRanges`
 * (LB-APP-043).
 */
export function toApiQuery(filters: SearchFilters, options: ApiQueryOptions = {}): URLSearchParams {
  const f = fixRanges(normalizeFilters(filters), options.rules);
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = f[key];
    if (value === null || (value === false && key !== "furnished")) {
      continue;
    }
    if (key === "polygon") {
      params.append(key, serializePolygon(f.polygon ?? []));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        params.append(`${key}[]`, String(item));
      }
    } else {
      params.append(key, String(value));
    }
  }
  const sort = parseSort(options.sort);
  if (sort !== DEFAULT_SORT) {
    params.append("sort", sort);
  }
  if (typeof options.cursor === "string" && options.cursor !== "" && options.cursor.length <= CURSOR_MAX_LENGTH) {
    params.append("cursor", options.cursor);
  }
  const [fewest, most] = API_LIMIT_RANGE;
  const limit = options.limit;
  if (typeof limit === "number" && Number.isInteger(limit) && limit >= fewest && limit <= most) {
    params.append("limit", String(limit));
  }
  return params;
}
