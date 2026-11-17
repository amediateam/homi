"use client";

import { type ListingSort, toSearchParams } from "@homi/search";
import { useTranslations } from "next-intl";

import { type RoutePresentation, RouteSheet } from "@/features/shell/RouteSheet";
import { closeThen } from "@/lib/navigation/closeThen";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useSearchState } from "@/lib/search/useSearchState";
import { tg } from "@/lib/telegram";

import { SortList } from "./SortList";

/**
 * The sort sheet at `/sort` (SCR-016, WP-25): a compact `RouteSheet` «Сортировка» around `SortList` for the live
 * search of the address. A pick plays a light impact, then one navigation instead of `setSort` and a close:
 * `closeThen` to the feed with the picked sort (`toSearchParams` leaves `new` out), and the page goes to the top,
 * where the feed re-creates itself for the new key. ×, the backdrop, the drag and Telegram's Back close without a
 * change. `data-route="sort"` (with `data-layer="sheet"` for the copy in `@sheet`) is what the end-to-end specs
 * select; the direct load renders it in place, so its server HTML holds it.
 */
export function SortSheetRoute({ presentation }: { presentation: RoutePresentation }) {
  const t = useTranslations();
  const { filters, sort } = useSearchState();
  const { findCity } = useReference();

  const pick = (picked: ListingSort) => {
    tg.haptic.impact("light");
    void closeThen(routes.feed(toSearchParams(filters, picked))).then(() => window.scrollTo(0, 0));
  };

  return (
    <RouteSheet presentation={presentation} variant="compact" title={t("sort.title")} closeLabel={t("common.close")}>
      <div data-route="sort" data-layer={presentation === "layer" ? "sheet" : undefined}>
        <SortList filters={filters} city={findCity(filters.city)} sort={sort} onPick={pick} />
      </div>
    </RouteSheet>
  );
}
