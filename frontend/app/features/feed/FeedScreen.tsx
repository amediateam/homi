"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { FeedRadarCard, useFeedRadar } from "@/features/nudges/FeedRadarCard";
import { usePathname } from "@/i18n/navigation";
import { measureScrollPerformance } from "@/lib/graphics";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { registerRefresh } from "@/lib/ui/shellState";

import { FeedEmpty } from "./FeedEmpty";
import { FIRST_VERSION, feedListKey, feedQuery, feedSearchKey } from "./feedQuery";
import { FewResultsNote, useFewResultsContext } from "./FewResultsNote";
import { ListingFeed } from "./ListingFeed";
import type { ListingPreview } from "./types";
import type { FeedInitial } from "./useCursorFeed";

export interface FeedScreenProps {
  /** The server's page one (cookie mode), `null` when the server did not read it (`readFirstPage`). */
  initial: FeedInitial<ListingPreview> | null;
  /** The network rule the server saw for the photos of page one (BR-APP-059). */
  serverSmallOnly: boolean;
  /**
   * The profile's city the server read page one for, on an address without a city (`readFirstPage`): the list's
   * city until the session knows `me`, so the hydration render builds the server's key (`useSearchState`).
   */
  profileCity?: string | null;
}

/**
 * The pulls of the search shown. Another search, a return to an earlier one included, starts again from
 * `FIRST_VERSION`, the version of the server's page one.
 */
interface Refreshed {
  search: string;
  version: number;
}

/** The scroll measurement of lite graphics runs once per launch, on the first scroll of the feed (`03` §1.7). */
let measured = false;

/**
 * The search list (SCR-007 … SCR-010; legacy `App` feed view). It lists the search of its own address
 * (`useScreenSearchState`, KI-43), so a listing or a sheet over it and another tab in front of it change nothing:
 * the list is neither re-created nor scrolled. The list key is the canonical query of the search and the refresh
 * version (`feedListKey`), the key `readFirstPage` gave the server's page one. A pull bumps the version of this
 * search, re-creates the list from page one through `/bff/listings`, and the indicator spins until page one has
 * answered; another search resets the version, so the server's page one of any later search is adopted. A new key
 * scrolls to the top before it is painted (SCR-007), never on the first render and never while the feed is covered.
 * After the cards: the few-results note (BR-APP-025) or the search empty state (SCR-009), as `listEnd` decides. Among
 * them, in the `inline` slot, the radar card (SCR-047, WP-30) while `useFeedRadar` holds — never while radars are
 * switched off (DEC-51).
 */
export function FeedScreen({ initial, serverSmallOnly, profileCity }: FeedScreenProps) {
  const search = useScreenSearchState("feed", { profileCity });
  const { filters, sort } = search;
  const own = matchRoute(usePathname()).route === "feed";
  const few = useFewResultsContext(filters);
  const radarCard = useFeedRadar(filters);

  const searchKey = feedSearchKey(filters, sort);
  const [stored, setRefreshed] = useState<Refreshed>({ search: searchKey, version: FIRST_VERSION });
  let refreshed = stored;
  if (stored.search !== searchKey) {
    // Adjusted while rendering, as `useCursorFeed` does: the version of the search left behind is forgotten.
    refreshed = { search: searchKey, version: FIRST_VERSION };
    setRefreshed(refreshed);
  }
  const listKey = feedListKey(filters, sort, refreshed.version);

  const waiting = useRef<(() => void)[]>([]);
  const settlePulls = useCallback(() => {
    const pulls = waiting.current;
    waiting.current = [];
    for (const resolve of pulls) {
      resolve();
    }
  }, []);
  useEffect(() => {
    const unregister = registerRefresh(
      routes.feed(),
      () =>
        new Promise<void>((resolve) => {
          waiting.current.push(resolve);
          setRefreshed((current) => ({
            search: searchKey,
            version: (current.search === searchKey ? current.version : FIRST_VERSION) + 1,
          }));
        }),
    );
    // A new search or a hidden feed ends the pull: the list it waited for is gone or paused.
    return () => {
      unregister();
      settlePulls();
    };
  }, [searchKey, settlePulls]);

  const scrolledFor = useRef(listKey);
  useLayoutEffect(() => {
    if (own && scrolledFor.current !== listKey) {
      scrolledFor.current = listKey;
      window.scrollTo(0, 0);
    }
  }, [own, listKey]);

  useEffect(() => {
    if (measured) {
      return undefined;
    }
    const onScroll = () => {
      measured = true;
      void measureScrollPerformance();
    };
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <ListingFeed
      source="feed"
      path="listings"
      query={feedQuery(filters, sort)}
      listKey={listKey}
      initial={initial}
      serverSmallOnly={serverSmallOnly}
      few={{ context: few, render: (visible) => <FewResultsNote search={search} count={visible} /> }}
      emptySlot={<FeedEmpty source="feed" search={search} />}
      inline={radarCard ? <FeedRadarCard filters={filters} /> : undefined}
      onFirstPage={settlePulls}
    />
  );
}
