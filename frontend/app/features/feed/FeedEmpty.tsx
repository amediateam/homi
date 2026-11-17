"use client";

import { countActiveFilters, resetAll } from "@homi/search";
import { Button, EmptyState } from "@homi/ui";
import { useTranslations } from "next-intl";

import { brand } from "@/lib/brand";
import { type DevFlags, devFlags } from "@/lib/flags";
import { searchRules } from "@/lib/search/rules";

import { offersReset } from "./fewResults";
import { type FeedSearch, FewActions, SECONDARY_BUTTON } from "./FewResultsNote";

export type FeedEmptyProps =
  | {
      source: "feed";
      /** The search of the feed's own address (`FeedSearch`). */
      search: FeedSearch;
      /** The app's flags; tests pass overrides (`withDevFlags`). */
      flags?: DevFlags;
    }
  | { source: "favorites" | "history" };

const SAVED_TEXTS = {
  favorites: { title: "feed.favEmpty", hint: "feed.favEmptyHint" },
  history: { title: "feed.histEmpty", hint: "feed.histEmptyHint" },
} as const;

/**
 * The empty states of the listing lists (SCR-009; legacy `FeedEmpty`). It never decides whether to show: the list
 * mounts it when `listEnd()` is `"empty"` — fully loaded, no error shown, 0 visible items and, for the search, no
 * few-results note. Favourites and history: the shrug, their title and hint, the tall layout, no action (WP-29
 * shows them).
 */
export function FeedEmpty(props: FeedEmptyProps) {
  const t = useTranslations();
  if (props.source === "feed") {
    return <SearchEmpty search={props.search} flags={props.flags} />;
  }
  const texts = SAVED_TEXTS[props.source];
  return (
    <EmptyState tall data-empty={props.source} image={brand.assets.emptyShrug} title={t(texts.title)} hint={t(texts.hint)} />
  );
}

/**
 * Search empty: the magnifier, «Ничего не нашлось», «Попробуйте ослабить фильтры» and «Сбросить фильтры», which writes
 * the defaults of the base deal and the city (BR-APP-022, `resetAll`) and keeps the sort, as legacy (a reset only
 * widens the sorts on offer). Legacy offers the reset with nothing to reset as well (LB-APP-038); with
 * `dev024ResetOnlyWithActiveFilters` (DEV-024) and no active filter the note's actions take its place — without the
 * city's stats that is the radar and «Другой город» at most, and when the stats arrive the list shows the note.
 */
function SearchEmpty({ search, flags = devFlags }: { search: FeedSearch; flags?: DevFlags }) {
  const t = useTranslations();
  const { filters, sort, write } = search;
  const reset = offersReset(countActiveFilters(filters), flags);
  return (
    <EmptyState
      data-empty="feed"
      image={brand.assets.emptyMagnifier}
      title={t("feed.nothing")}
      hint={t("feed.nothingHint")}
      action={
        reset ? (
          <Button
            variant="secondary"
            data-empty-action="reset"
            className={SECONDARY_BUTTON}
            onClick={() => write(resetAll(filters, null, searchRules(flags)), sort)}
          >
            {t("feed.resetFilters")}
          </Button>
        ) : (
          <FewActions search={search} count={0} />
        )
      }
    />
  );
}
