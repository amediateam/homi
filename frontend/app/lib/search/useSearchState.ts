"use client";

import { cityFallback, fromSearchParams, type ListingSort, SEARCH_PARAM_KEYS, type SearchFilters, toSearchParams } from "@homi/search";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { usePathname } from "@/i18n/navigation";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useSession } from "@/lib/session/SessionProvider";
import { storageGet } from "@/lib/storage";

const SEARCH_KEYS: ReadonlySet<string> = new Set(SEARCH_PARAM_KEYS);

export interface SearchStateApi {
  filters: SearchFilters;
  sort: ListingSort;
  setFilters: (next: SearchFilters) => void;
  setSort: (sort: ListingSort) => void;
  /** Another address with the current state, e.g. `href(routes.map)`. */
  href: (builder: (params: URLSearchParams) => string) => string;
}

/**
 * The search state in the address (WP-22, `25` §3.2). A Client Component under `<Suspense>`
 * (`use-search-params.md`). It reads the 25 keys and `sort` with `fromSearchParams` and writes them with
 * `nav.replace` on the current root (`/` or `/map`): the search keys first, in their fixed order, then every other
 * parameter of the address as it was, so a reserved parameter (`from`, `focus`, …) is never touched and equal states
 * give equal addresses. An address without a city takes the profile's city, else the saved one, else Tashkent
 * (BR-APP-001, BR-APP-010); an address that carries a city keeps it.
 */
export function useSearchState(): SearchStateApi {
  const params = useSearchParams();
  const pathname = usePathname();
  const { me } = useSession();
  const fallbackCity = cityFallback({ profile: me?.city, saved: storageGet("homi-city") });
  const { filters, sort } = useMemo(() => fromSearchParams(params, { fallbackCity }), [params, fallbackCity]);

  const write = (next: SearchFilters, nextSort: ListingSort) => {
    const query = toSearchParams(next, nextSort);
    for (const [key, value] of params) {
      if (!SEARCH_KEYS.has(key)) {
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
    href: (builder) => builder(toSearchParams(filters, sort)),
  };
}
