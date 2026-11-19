"use client";

import { cn } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";

import { FeedEmpty } from "@/features/feed/FeedEmpty";
import { FEED_FRAME } from "@/features/feed/ListingCardSkeleton";
import { ListingFeed } from "@/features/feed/ListingFeed";
import type { DevFlags } from "@/lib/flags";

import { ClearHistoryButton } from "./ClearHistoryButton";
import { focusSavedListIfLost, SAVED_QUERY, type SavedScreenProps, useSavedList } from "./useSavedList";

export interface HistoryScreenProps extends SavedScreenProps {
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

/**
 * «Смотрели» (SCR-025; legacy `App` saved view, history): the listings the user opened in `ListingFeed`, 20 at a time
 * with the feed's cursor (DEC-53), every item shown — the launch's hidden ones too — and never the «viewed» eye
 * (BR-APP-040). The list key is `useSavedList`'s: a tab entering the page re-creates the list from that server
 * render, a pull from page one through `/bff`, and the return from a listing opened in this launch once more.
 * «Очистить» stands above the first card (`ClearHistoryButton`); after a clear the list is replaced by the empty
 * state, with no refetch (legacy emptied its items), until the next key brings the list back. The cleared list is
 * the one shown when the server answered, so a pull during the request cannot bring the old entries back with the
 * success haptic. The empty state takes the focus that the gone button had, and a status line, mounted before,
 * reads «Вы ещё ничего не открывали» (WCAG 2.4.3, 4.1.3). The launch's `seen` map is left as it is (Q-API-035).
 * Empty: the shrug, «Вы ещё ничего не открывали» and its hint (SCR-009).
 */
export function HistoryScreen({ initial, renderId, serverSmallOnly, flags }: HistoryScreenProps) {
  const t = useTranslations();
  const { listKey, onFirstPage } = useSavedList("history", renderId);
  /** The list key that was cleared: its list is not shown again. */
  const [cleared, setCleared] = useState<string | null>(null);
  /** The key shown now, read when the server answers the clear. */
  const shown = useRef(listKey);
  useLayoutEffect(() => {
    shown.current = listKey;
  }, [listKey]);

  const isCleared = cleared === listKey;
  useLayoutEffect(() => {
    if (isCleared) {
      focusSavedListIfLost("history");
    }
  }, [isCleared]);

  return (
    <>
      {isCleared ? (
        <div data-feed="history" tabIndex={-1} className={cn(FEED_FRAME, "outline-none")}>
          <FeedEmpty source="history" />
        </div>
      ) : (
        <ListingFeed
          source="history"
          path="history"
          query={SAVED_QUERY}
          listKey={listKey}
          initial={initial}
          serverSmallOnly={serverSmallOnly}
          emptySlot={<FeedEmpty source="history" />}
          above={<ClearHistoryButton onCleared={() => setCleared(shown.current)} flags={flags} />}
          onFirstPage={onFirstPage}
          flags={flags}
        />
      )}
      <p role="status" data-cleared-status="" className="sr-only">
        {isCleared ? t("feed.histEmpty") : null}
      </p>
    </>
  );
}
