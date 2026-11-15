import { cityFallback, fromSearchParams, type SearchParamsInput, type SearchState } from "@homi/search";

/**
 * The search state of an address for Server Components (WP-22): the same parsing as `useSearchState`. The server
 * has no saved city (`homi-city` lives in the browser), so an address without a city falls back to the profile's
 * city, else Tashkent.
 */
export function readSearchState(searchParams: SearchParamsInput, me: { city?: string | null } | null | undefined): SearchState {
  return fromSearchParams(searchParams, { fallbackCity: cityFallback({ profile: me?.city }) });
}

/** The state of a remembered address (the shell's last search, the radar «+»). */
export function searchStateFromHref(href: string, fallbackCity?: string | null): SearchState {
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1).split("#")[0] : "";
  return fromSearchParams(query, { fallbackCity });
}
