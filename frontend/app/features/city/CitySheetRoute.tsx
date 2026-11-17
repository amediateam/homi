"use client";

import { toSearchParams } from "@homi/search";
import { useEffect } from "react";

import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useSearchState } from "@/lib/search/useSearchState";

import { CityPickerSheet } from "./CityPickerSheet";
import { useCityPick } from "./useCityPick";

/**
 * The city sheet at `/city` (SCR-017, WP-25), opened by the city chip of the feed header: the header variant of
 * `CityPickerSheet` for the live search of the address. A pick is `useCityPick`'s header variant — the city change of
 * BR-APP-009 on the live filters with the sort the new city still offers, the city saved, then `closeThen` to the feed
 * of the new search. ×, the backdrop, the drag and Telegram's Back close without a change.
 *
 * With one city in the loaded reference data there is nothing to pick and the feed header offers no chip; an address
 * that still reaches `/city` is replaced by the feed of its search and nothing renders. While the reference data is
 * missing the sheet shows, with no rows, rather than guess.
 */
export function CitySheetRoute({ presentation }: { presentation: RoutePresentation }) {
  const { filters, sort } = useSearchState();
  const { loaded, cities } = useReference();
  const pick = useCityPick({ variant: "header", filters, sort });
  const single = loaded && cities.length < 2;
  const feed = routes.feed(toSearchParams(filters, sort));

  useEffect(() => {
    if (single) {
      nav.replace(feed);
    }
  }, [single, feed]);

  if (single) {
    return null;
  }
  return <CityPickerSheet variant="header" presentation={presentation} current={filters.city} onPick={pick} />;
}
