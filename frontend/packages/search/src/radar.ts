import { fixRanges } from "./availability";
import { resolveRules } from "./defaults";
import { normalizeFilters } from "./normalize";
import type { SearchFilters, SearchRules } from "./types";

type Json<T> = T extends readonly (infer Item)[] ? Json<Item>[] : T;

/** The `filters` object of `POST /radars` and `PUT /radars/{id}` (WP-13): the 25 keys as JSON values. */
export type RadarFilters = { -readonly [Key in keyof SearchFilters]: Json<SearchFilters[Key]> };

/**
 * A search state as the `filters` of a radar body: normalised, every key present, the polygon as `[[lat, lon], …]`.
 * Legacy keeps `posted_days`; `dev005RadarDropsPostedDays` sets it to `null` (DEV-005). Inverted ranges are swapped
 * only with `dev025ValidateRanges` (LB-APP-043).
 */
export function toRadarFilters(filters: SearchFilters, rules: Partial<SearchRules> = {}): RadarFilters {
  const resolved = resolveRules(rules);
  const f = fixRanges(normalizeFilters(filters), resolved);
  return {
    ...f,
    types: [...f.types],
    districts: [...f.districts],
    renovation: [...f.renovation],
    appliances: [...f.appliances],
    zones: [...f.zones],
    posted_days: resolved.dev005RadarDropsPostedDays ? null : f.posted_days,
    polygon: f.polygon === null ? null : f.polygon.map(([lat, lon]) => [lat, lon]),
  };
}
