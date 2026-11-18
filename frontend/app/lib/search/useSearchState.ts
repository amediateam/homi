"use client";

import { cityFallback, fromSearchParams, type ListingSort, SEARCH_PARAM_KEYS, type SearchFilters, toSearchParams } from "@homi/search";
import { useSearchParams } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";

import { usePathname } from "@/i18n/navigation";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useSession } from "@/lib/session/SessionProvider";
import { storageGet, subscribeStorage } from "@/lib/storage";

const SEARCH_KEYS: ReadonlySet<string> = new Set(SEARCH_PARAM_KEYS);

/** The `from` of a radar's feed («Смотреть найденное», WP-30), the one reserved value a write removes. */
const FROM_RADAR = "radar";

const savedCity = (): string | null => storageGet("homi-city");
/** The server knows no saved city, and neither does the hydration render, so both list the same city. */
const noSavedCity = (): null => null;

export interface SearchStateOptions {
  /**
   * The profile's city as the server read it (`/me`, the feed's page one): the profile of the fallback chain until
   * the session knows `me`, so the server render and the hydration render list the city the server read for.
   */
  profileCity?: string | null;
}

export interface SearchStateApi {
  filters: SearchFilters;
  sort: ListingSort;
  setFilters: (next: SearchFilters) => void;
  setSort: (sort: ListingSort) => void;
  /**
   * Filters and sort in one replace (WP-23, D-SH-2): the deal switch writes `switchDeal()` and the sort it still
   * allows together, which `setFilters` then `setSort` cannot — each writes the other half from the current address.
   */
  write: (filters: SearchFilters, sort: ListingSort) => void;
  /** Another address with the current state, e.g. `href(routes.map)`. */
  href: (builder: (params: URLSearchParams) => string) => string;
}

/**
 * The search state in the address (WP-22, `25` §3.2). A Client Component under `<Suspense>`
 * (`use-search-params.md`). It reads the 25 keys and `sort` with `fromSearchParams` and writes them with
 * `nav.replace` on the current root (`/` or `/map`): the search keys first, in their fixed order, then every other
 * parameter of the address as it was, so a reserved parameter (`from`, `focus`, …) is kept and equal states give
 * equal addresses. An address without a city takes the profile's city, else the saved one, else Tashkent
 * (BR-APP-001, BR-APP-010); an address that carries a city keeps it. Before the session knows `me` the profile is
 * `profileCity`, and the saved city is read through `useSyncExternalStore`: the hydration render takes none, as the
 * server render did, and the next render takes it (WP-24).
 *
 * The one reserved value a write removes is `from=radar`, the mark of a radar's feed (WP-30): the deal switch, the
 * few-results actions, the empty state's reset, `setFilters` and `setSort` all write through `write`, so any change
 * on that feed makes the radar's filters the user's search, which the shell then remembers again (`rememberHref`;
 * legacy "a tab press clears the radar return", `03` §1.2). Another `from` (`map`) stays.
 */
export function useSearchState(options: SearchStateOptions = {}): SearchStateApi {
  const params = useSearchParams();
  const pathname = usePathname();
  const { me } = useSession();
  const saved = useSyncExternalStore(subscribeStorage, savedCity, noSavedCity);
  const fallbackCity = cityFallback({ profile: me ? me.city : options.profileCity, saved });
  const { filters, sort } = useMemo(() => fromSearchParams(params, { fallbackCity }), [params, fallbackCity]);

  const write = (next: SearchFilters, nextSort: ListingSort) => {
    const query = toSearchParams(next, nextSort);
    for (const [key, value] of params) {
      if (!SEARCH_KEYS.has(key) && !(key === "from" && value === FROM_RADAR)) {
        query.append(key, value);
      }
    }
    nav.replace(pathname.startsWith("/map") ? routes.map(query) : routes.feed(query));
  };

  return {
    filters,
    sort,
    setFilters: (next) => write(next, sort),
    setSort: (nextSort) => write(filters, nextSort),
    write,
    href: (builder) => builder(toSearchParams(filters, sort)),
  };
}
