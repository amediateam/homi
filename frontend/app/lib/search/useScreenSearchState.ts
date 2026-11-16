"use client";

import { fromSearchParams, toSearchParams } from "@homi/search";
import { useMemo, useState } from "react";

import { usePathname } from "@/i18n/navigation";
import { matchRoute } from "@/lib/navigation/routes";

import { type SearchStateApi, type SearchStateOptions, useSearchState } from "./useSearchState";

/** The screens whose own address carries the search state: the list and the map of the search tab. */
export type SearchScreen = "feed" | "map";

/**
 * The search state of a screen's own address (KI-43). `usePathname` and `useSearchParams` are global, so a screen
 * kept mounted below a layer (a listing or a sheet over the feed) and a route kept hidden under another tab
 * (`cacheComponents`, `preserving-ui-state.md`) would read the address on top. This hook reads `useSearchState()`
 * live while the pathname is the screen's own route and holds the last live state otherwise; before the screen was
 * ever its own address (a sheet loaded directly) it is the live reading. The held state is the canonical query of
 * `toSearchParams`, which always carries the city, so it parses back to the same state and gives the same list key.
 * Adjusted while rendering, as the shell's variant is: an effect would not run in a hidden route.
 *
 * While held, `write` and its two shortcuts still write on the live address; nothing calls them then, because the
 * screen is covered or hidden.
 */
export function useScreenSearchState(screen: SearchScreen, options?: SearchStateOptions): SearchStateApi {
  const live = useSearchState(options);
  const own = matchRoute(usePathname()).route === screen;
  const liveQuery = toSearchParams(live.filters, live.sort).toString();
  const [held, setHeld] = useState<string | null>(own ? liveQuery : null);
  if (own && held !== liveQuery) {
    setHeld(liveQuery);
  }

  const query = own || held === null ? null : held;
  const kept = useMemo(() => (query === null ? null : fromSearchParams(query)), [query]);
  if (kept === null) {
    return live;
  }
  const { filters, sort } = kept;
  return {
    filters,
    sort,
    setFilters: (next) => live.write(next, sort),
    setSort: (nextSort) => live.write(filters, nextSort),
    write: live.write,
    href: (builder) => builder(toSearchParams(filters, sort)),
  };
}
