import { baseDeal, isCustomFilters, normalizeFilters, sameFilters, type SearchFilters } from "@homi/search";

import type { Radar } from "./normalize";
import { useRadars } from "./useRadars";

/**
 * Which radar a search already has (WP-30). Every comparison is `sameFilters` of WP-22 (BR-APP-012: normalised,
 * `posted_days` ignored); the three questions differ in which radars count.
 */

/**
 * Some radar, on or paused, has exactly these filters: the follow nudge is not offered for them (BR-APP-043, legacy
 * `followNudge.js`, which compared the whole list).
 */
export function hasSameRadar(filters: SearchFilters, radars: readonly Radar[]): boolean {
  return radars.some((radar) => sameFilters(radar.filters, filters));
}

/**
 * A radar already covers this search, so the return banner and the radar card in the feed stay away (BR-APP-071,
 * BR-APP-072, legacy `hasRadarFor`): any radar, on or paused, with the same filters; for default filters
 * (`!isCustomFilters`, the plain «аренда / продажа в городе») also any radar of the same base deal in the same city,
 * whatever else it narrows. A radar's city is always set (`normalizeFilters`), so legacy's `'tashkent'` fallback for a
 * radar without one is already in it.
 */
export function hasRadarFor(filters: SearchFilters, radars: readonly Radar[]): boolean {
  if (hasSameRadar(filters, radars)) {
    return true;
  }
  if (isCustomFilters(filters)) {
    return false;
  }
  const search = normalizeFilters(filters);
  const deal = baseDeal(search.deal);
  return radars.some((radar) => baseDeal(radar.filters.deal) === deal && radar.filters.city === search.city);
}

/** An **active** radar has these filters: the pure half of `useHasActiveRadar`. */
export function hasActiveRadar(filters: SearchFilters, radars: readonly Radar[]): boolean {
  return radars.some((radar) => radar.active && sameFilters(radar.filters, filters));
}

/**
 * An active radar with the same filters is on the plain radar list of the search tab (`useRadars()`), so the filters
 * footer shows ✓ «Радар включён» and the few-results note hides «Включить радар по этому поиску» (legacy
 * `FiltersSheet.jsx`: active radars only). `false` while the list is not loaded, before the session is ready, while
 * radars are switched off (DEC-51: then nothing is requested) and while the caller's `enabled` is `false` — the
 * footer of the radar forms, which never shows the ✓, so the radar tab sends no plain read. The first caller on the
 * search tab reads the list.
 */
export function useHasActiveRadar(filters: SearchFilters, enabled = true): boolean {
  const { radars } = useRadars({ enabled });
  return !enabled || radars === undefined ? false : hasActiveRadar(filters, radars);
}
