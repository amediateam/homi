"use client";

import { FeedEmpty } from "@/features/feed/FeedEmpty";
import { ListingFeed } from "@/features/feed/ListingFeed";
import type { DevFlags } from "@/lib/flags";

import { SAVED_QUERY, type SavedScreenProps, useSavedList } from "./useSavedList";

export interface FavoritesScreenProps extends SavedScreenProps {
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

/**
 * «Избранное» (SCR-024; legacy `App` saved view, favourites): the user's favourites in `ListingFeed`, 20 at a time
 * with the feed's cursor (DEC-53), with the feed's loading, error and 403 states. A card un-favourited or hidden in
 * this launch drops out at once (`03` §1.11) and returns when the save fails. The list key is `useSavedList`'s: a
 * tab entering the page re-creates the list from that server render, a pull from page one through `/bff`. Empty:
 * the shrug, «Здесь пока пусто» and its hint (SCR-009).
 */
export function FavoritesScreen({ initial, renderId, serverSmallOnly, flags }: FavoritesScreenProps) {
  const { listKey, onFirstPage } = useSavedList("favorites", renderId);
  return (
    <ListingFeed
      source="favorites"
      path="favorites"
      query={SAVED_QUERY}
      listKey={listKey}
      initial={initial}
      serverSmallOnly={serverSmallOnly}
      emptySlot={<FeedEmpty source="favorites" />}
      onFirstPage={onFirstPage}
      flags={flags}
    />
  );
}
