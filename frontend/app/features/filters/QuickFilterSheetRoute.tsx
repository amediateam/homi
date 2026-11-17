"use client";

import { type SearchFilters, sectionsFor, toSearchParams } from "@homi/search";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { useRouter } from "@/i18n/navigation";
import { devFlags } from "@/lib/flags";
import { closeThen } from "@/lib/navigation/closeThen";
import { type QuickFilterKind, routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { useSearchState } from "@/lib/search/useSearchState";
import { tg } from "@/lib/telegram";

import { applyFilters } from "./applyFilters";
import { formKey } from "./formKey";
import { QuickFilterForm } from "./QuickFilterForm";

/**
 * The quick filter sheet at `/filters/<kind>` (SCR-015, WP-25): the client glue around `QuickFilterForm` for the live
 * search of the address, and the one place its flags are read (`searchRules(devFlags)`).
 *
 * - The form is keyed with `formKey` on the router's `bfcacheId`, so every open starts from the address and never from
 *   a draft left by an earlier visit that `cacheComponents` kept hidden (`use-router.md`, `preserving-ui-state.md`);
 *   an address without a city also keys on its fallback city, which the hydration render of a direct load does not
 *   know yet (review C-3).
 * - «Показать …» plays a medium impact and goes through `applyFilters` to the feed with the sort of the address; the
 *   quick sheets do not change the city, so nothing is saved.
 * - The rooms sheet of a search whose types hide rooms (BR-APP-006; reachable only by a direct load, the chip is
 *   hidden) renders nothing and leaves for the feed with the search of the address: `closeThen`, which is the replace
 *   alone at depth 0 and keeps history from growing in the slot.
 */
export function QuickFilterSheetRoute({ kind, presentation }: { kind: QuickFilterKind; presentation: RoutePresentation }) {
  const { filters, sort } = useSearchState();
  const { bfcacheId } = useRouter();
  const address = useSearchParams();
  const { findCity } = useReference();
  const rules = searchRules(devFlags);
  const roomsHidden = kind === "rooms" && !sectionsFor(filters, findCity(filters.city), "search", rules).rooms;
  const left = useRef(false);
  const feed = routes.feed(toSearchParams(filters, sort));

  useEffect(() => {
    if (roomsHidden && !left.current) {
      left.current = true;
      void closeThen(feed);
    }
  }, [roomsHidden, feed]);

  if (roomsHidden) {
    return null;
  }

  const apply = (draft: SearchFilters) => {
    tg.haptic.impact("medium");
    void applyFilters(draft, { sort, target: routes.feed, city: findCity(draft.city), rules });
  };

  return (
    <QuickFilterForm
      key={formKey(bfcacheId, address, filters.city)}
      kind={kind}
      initial={filters}
      presentation={presentation}
      rules={rules}
      onApply={apply}
    />
  );
}
