import { cityFallback, fromSearchParams, normalizeFilters, type SearchParamsInput, type SearchState } from "@homi/search";

/**
 * The search state of an address for Server Components (WP-22): the same parsing as `useSearchState`. The server
 * has no saved city (`homi-city` lives in the browser), so an address without a city falls back to the profile's
 * city, else Tashkent.
 */
export function readSearchState(searchParams: SearchParamsInput, me: { city?: string | null } | null | undefined): SearchState {
  return fromSearchParams(searchParams, { fallbackCity: cityFallback({ profile: me?.city }) });
}

/**
 * The city an address names itself: its first `city` when that has the shape of a code (`normalizeFilters`), else
 * `null`; a later `city` is not looked at, as `fromSearchParams` reads the first. Without one the city comes from the
 * fallback chain of BR-APP-010, so the feed's page one reads `/me` first (WP-24).
 */
export function addressCity(searchParams: SearchParamsInput): string | null {
  const value =
    typeof searchParams === "string" || searchParams instanceof URLSearchParams
      ? new URLSearchParams(searchParams).get("city")
      : [searchParams.city].flat()[0];
  return typeof value === "string" && normalizeFilters({ city: value }).city === value ? value : null;
}

/** The state of a remembered address (the shell's last search, the radar «+»). */
export function searchStateFromHref(href: string, fallbackCity?: string | null): SearchState {
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1).split("#")[0] : "";
  return fromSearchParams(query, { fallbackCity });
}
