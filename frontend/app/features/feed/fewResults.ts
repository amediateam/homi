import { type BaseDeal, baseDeal, type CityStatsRef, type Deal } from "@homi/search";

import { type DevFlags, devFlags } from "@/lib/flags";

/** The sources of a listing list (`ListingFeed`): the search feed, favourites, history. */
export type FeedSource = "feed" | "favorites" | "history";

/** A fully loaded search list with fewer visible items than this gets the few-results note (legacy `FEW_RESULTS`). */
export const FEW_RESULTS = 10;

/** What the note knows about the search; `useFewResultsContext(filters)` of `FewResultsNote.tsx` reads it. */
export interface FewResultsContext {
  /** `countActiveFilters(filters)` (BR-APP-011). */
  activeFilters: number;
  /** The city's entry of `GET /cities`; `null` while the stats are not loaded or the city has none. */
  stats: CityStatsRef | null;
  /** The city's name in the reference data; `null` while it is unknown. */
  cityName: string | null;
}

/** The end of a list as `ListingFeed` sees it. */
export interface ListEnd {
  source: FeedSource;
  /** The last page arrived (`useCursorFeed().done`). */
  done: boolean;
  /** An error state or the inline retry is shown. */
  error: boolean;
  /** Items after removing `hidden` (favourites: also those un-favourited in this launch). */
  visible: number;
}

/**
 * The few-results note (BR-APP-025, SCR-009): the search feed, fully loaded without an error, fewer than 10 visible
 * items, no active filters, the city's stats loaded and its name known.
 */
export function showsFewResults(list: ListEnd, context: FewResultsContext | null): boolean {
  return (
    list.source === "feed" &&
    list.done &&
    !list.error &&
    list.visible < FEW_RESULTS &&
    context !== null &&
    context.activeFilters === 0 &&
    context.stats !== null &&
    Boolean(context.cityName)
  );
}

/**
 * What follows the last card (SCR-009): the note, the empty state (0 visible and no note), or nothing. Neither shows
 * before the list ends or while an error is shown; `context` is the search's (`null` for favourites and history).
 */
export function listEnd(list: ListEnd, context: FewResultsContext | null): "few" | "empty" | null {
  if (!list.done || list.error) {
    return null;
  }
  if (showsFewResults(list, context)) {
    return "few";
  }
  return list.visible === 0 ? "empty" : null;
}

export type FewTitleKey = "feed.nothing" | "feed.fewRent" | "feed.fewSale";

/** The note's title: «Ничего не нашлось» with 0 items, else «… об аренде» (daily rent included) or «… о продаже». */
export function fewTitleKey(visible: number, deal: Deal): FewTitleKey {
  if (visible === 0) {
    return "feed.nothing";
  }
  return deal === "sale" ? "feed.fewSale" : "feed.fewRent";
}

/** The other deal of the note: sale for rent (daily rent included), long-term rent for sale. */
export function otherDealOf(deal: Deal): BaseDeal {
  return baseDeal(deal) === "sale" ? "rent_long" : "sale";
}

export interface OtherDealOffer {
  deal: BaseDeal;
  /** The other deal's listings in the city (`GET /cities` counts). */
  count: number;
}

/**
 * «Смотреть продажу · N» / «Смотреть аренду · N» (BR-APP-025): only when the other deal has more listings in the city
 * than are visible now. A missing count is 0; without stats nothing is offered.
 */
export function otherDealOffer(deal: Deal, stats: CityStatsRef | null, visible: number): OtherDealOffer | null {
  const other = otherDealOf(deal);
  const count = stats?.counts?.[other] ?? 0;
  return count > visible ? { deal: other, count } : null;
}

/**
 * «Сбросить фильтры» of the search empty state (LB-APP-038): legacy offers it always, even with nothing to reset;
 * with `dev024ResetOnlyWithActiveFilters` (DEV-024) only when a filter is active, else the note's actions take its
 * place.
 */
export function offersReset(activeFilters: number, flags: DevFlags = devFlags): boolean {
  return !flags.dev024ResetOnlyWithActiveFilters || activeFilters > 0;
}
