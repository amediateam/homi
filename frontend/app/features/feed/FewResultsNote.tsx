"use client";

import { type BaseDeal, countActiveFilters, normalizeSort, type SearchFilters, sortOptions, switchDeal } from "@homi/search";
import { Button, cn, RadarIcon } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRadarsEnabled } from "@/features/radars/capability";
import { useHasActiveRadar } from "@/features/radars/match";
import { useSubscribe } from "@/features/radars/subscribe";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useCityStats, useReference } from "@/lib/reference/useReference";
import type { SearchStateApi } from "@/lib/search/useSearchState";
import { tg } from "@/lib/telegram";

import { type FewResultsContext, fewTitleKey, otherDealOffer } from "./fewResults";

/**
 * The search of the feed's own address (KI-43): the feed passes the state it lists, live or held, never the global
 * address, so the note under a layer keeps its texts.
 */
export type FeedSearch = Pick<SearchStateApi, "filters" | "sort" | "write" | "href">;

/** Legacy `secondary-btn`: 48 px, 16 px sides, 15 px semibold. */
export const SECONDARY_BUTTON = "h-[48px] gap-[8px] px-[16px] text-[15px]";

/** What `showsFewResults` needs to know about the search: active filters, the city's stats and its name. */
export function useFewResultsContext(filters: SearchFilters): FewResultsContext {
  const { findCity } = useReference();
  const stats = useCityStats(filters.city);
  return { activeFilters: countActiveFilters(filters), stats, cityName: findCity(filters.city)?.name || null };
}

/**
 * The note's buttons (SCR-009), also the DEV-024 empty state's: «Смотреть продажу / аренду · N» when the other deal
 * has more listings in the city than `count`; «Включить радар по этому поиску» only when radars are on
 * (`useRadarsEnabled()`, DEC-51) and no active radar has these filters (`useHasActiveRadar`); a tap plays a light
 * haptic and runs `useSubscribe().subscribe(filters, "few")` (WP-30), whose toast shows over the feed, and the button
 * is disabled while it runs; «Другой город» with more than one city. The deal switch is the title tabs' (`TopBar`):
 * `switchDeal()` (geography kept, BR-APP-002) and the sort it still offers (BR-APP-023) in one replace, a light
 * haptic, the list at the top.
 * «Другой город» pushes the full filters sheet with the search state, as legacy opened it; it gives no haptic.
 */
export function FewActions({ search, count, className }: { search: FeedSearch; count: number; className?: string }) {
  const t = useTranslations();
  const { cities, findCity } = useReference();
  const { filters, sort, write, href } = search;
  const stats = useCityStats(filters.city);
  const offer = otherDealOffer(filters.deal, stats, count);
  const radarsEnabled = useRadarsEnabled();
  const hasRadar = useHasActiveRadar(filters);
  const { subscribe } = useSubscribe();
  const [subscribing, setSubscribing] = useState(false);

  const seeOther = (deal: BaseDeal) => {
    const switched = switchDeal(filters, deal);
    tg.haptic.impact();
    write(switched, normalizeSort(sort, sortOptions(switched, findCity(switched.city))));
    window.scrollTo(0, 0);
  };
  const subscribeHere = () => {
    if (subscribing) {
      return;
    }
    tg.haptic.impact();
    setSubscribing(true);
    const done = () => setSubscribing(false);
    subscribe(filters, "few").then(done, done);
  };

  return (
    <div data-slot="few-actions" className={cn("flex flex-col gap-[8px]", className)}>
      {offer ? (
        <Button variant="secondary" data-few="deal" className={cn(SECONDARY_BUTTON, "w-full")} onClick={() => seeOther(offer.deal)}>
          {t(offer.deal === "sale" ? "feed.seeSale" : "feed.seeRent", { n: offer.count })}
        </Button>
      ) : null}
      {radarsEnabled && !hasRadar ? (
        <Button
          variant="secondary"
          data-few="radar"
          disabled={subscribing}
          className={cn(SECONDARY_BUTTON, "w-full")}
          onClick={subscribeHere}
        >
          <RadarIcon size={17} />
          {t("feed.subscribeHere")}
        </Button>
      ) : null}
      {cities.length > 1 ? (
        <Button
          variant="text"
          data-few="city"
          className="self-center px-[12px] py-[6px] text-[15px] text-text"
          onClick={() => nav.push(href((params) => routes.filters(params)))}
        >
          {t("feed.otherCity")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The few-results note under a short search list (BR-APP-025, SCR-009; legacy `FewResultsNote`). The list mounts it
 * when `showsFewResults` holds; `count` is the visible items. Title «Ничего не нашлось» with 0 items, else «Это все
 * объявления об аренде» (daily rent included) or «… о продаже»; the hint names the city, a server string rendered as
 * text; then `FewActions`. The 20 px corner of legacy `few-note` takes the nearest radius token, 24 px.
 */
export function FewResultsNote({ search, count }: { search: FeedSearch; count: number }) {
  const t = useTranslations();
  const { findCity } = useReference();
  const { filters } = search;
  return (
    <div data-slot="few-note" className="flex flex-col gap-[6px] rounded-large border border-sep p-[18px]">
      <p className="text-[17px] font-bold text-text">{t(fewTitleKey(count, filters.deal))}</p>
      <p className="text-hint">{t("feed.fewHint", { city: findCity(filters.city)?.name ?? "" })}</p>
      <FewActions search={search} count={count} className="mt-[8px]" />
    </div>
  );
}
