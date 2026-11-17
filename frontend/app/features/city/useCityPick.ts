"use client";

import { type ListingSort, normalizeSort, pickCity, type SearchFilters, sortOptions, toSearchParams } from "@homi/search";
import { useSearchParams } from "next/navigation";
import { useCallback, useLayoutEffect, useRef } from "react";

import { updateSettings } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { closeThen } from "@/lib/navigation/closeThen";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useSession } from "@/lib/session/SessionProvider";
import { storageSet } from "@/lib/storage";

/**
 * Saves the user's city (WP-25, as the first-launch page does, D-S-10): `homi-city`, `PATCH /settings` fired and not
 * awaited — its errors are ignored and the local choice stands — and `patchMe`, without which the profile's old city
 * would win `cityFallback` on the next address without a city (and `SessionProvider` would write it back to
 * `homi-city`). The header pick calls it at once; the full sheet on «Показать» and on the draw hand-off.
 *
 * Only a city of the reference data is saved: the full sheet's draft may carry a city that came from the server (a
 * relax option's filters), and a code the app does not know would otherwise become the user's city on the device
 * while the API refuses it (WP-25 security review, S-1). An unknown code — or any code while the reference data is
 * missing — saves nothing.
 */
export function useSaveCity(): (code: string) => void {
  const save = useAction(updateSettings);
  const { patchMe } = useSession();
  const { findCity } = useReference();
  return useCallback(
    (code: string) => {
      const city = findCity(code);
      if (city === null) {
        return;
      }
      storageSet("homi-city", city.code);
      void save({ city: city.code });
      patchMe({ city: city.code });
    },
    [save, patchMe, findCity],
  );
}

/** Where a pick lands: the live search of the feed header's `/city`, or the draft of the full sheet's `pick=city`. */
export type CityPickTarget =
  | { variant: "header"; filters: SearchFilters; sort: ListingSort }
  | { variant: "nested"; draft: SearchFilters; update: (patch: Partial<SearchFilters>) => void; close: () => void };

/**
 * What a row of the city sheet does (WP-25, SCR-017). Both variants apply the city change of BR-APP-009
 * (`pickCity`: districts and polygon cleared, zones, metro and `below_median` kept only where the new city has them);
 * an unknown code does nothing. The light haptic of a row and the success haptic of a found position are
 * `CityList`'s.
 *
 * - `header`: on the live filters, with the sort the new city still offers (else `new`, BR-APP-023); the city saved
 *   (`useSaveCity`); `closeThen` to the feed of the new search, then the top of the page. Not an apply: the
 *   `onFiltersApplied` listeners are not told.
 * - `nested`: on the draft only, then the layer closes; nothing is saved until «Показать» or the draw hand-off.
 *
 * One pick per showing: a second tap before the address changed is ignored, since a second Back would also close
 * what lies below. The address changing, or the sheet being hidden or left, takes picks again.
 */
export function useCityPick(target: CityPickTarget): (code: string) => void {
  const { findCity } = useReference();
  const saveCity = useSaveCity();
  const address = useSearchParams()?.toString() ?? "";
  const picked = useRef(false);

  useLayoutEffect(() => {
    picked.current = false;
    return () => {
      picked.current = false;
    };
  }, [address]);

  return (code: string) => {
    const city = picked.current ? null : findCity(code);
    if (city === null) {
      return;
    }
    picked.current = true;
    if (target.variant === "nested") {
      target.update(pickCity(target.draft, city));
      target.close();
      return;
    }
    const next = pickCity(target.filters, city);
    const sort = normalizeSort(target.sort, sortOptions(next, city));
    saveCity(city.code);
    void closeThen(routes.feed(toSearchParams(next, sort))).then(() => window.scrollTo(0, 0));
  };
}
