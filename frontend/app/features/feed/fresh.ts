"use client";

import { type SearchFilters, toApiQuery } from "@homi/search";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { newCount } from "@/features/nudges/newCount";
import { MINI_CHROME_TOP_ZONE_PX } from "@/features/shell/useMiniChrome";
import { bffFetch } from "@/lib/api/browser";
import { devFlags } from "@/lib/flags";
import { matchRoute, parentOf } from "@/lib/navigation/routes";
import { searchRules } from "@/lib/search/rules";

import { bumpFeedEpoch } from "./feedQuery";
import { forgetFeedScroll, peekFeedScroll } from "./feedScroll";

/**
 * The long return of the search feed and the fresh pill (WP-38, BR-APP-104, SCR-063; legacy `App.jsx` since
 * `index-CIa0Ldj2.js`). The visit tracker calls `onLongReturn` when the app becomes visible after at least 6 h in the
 * background (`features/nudges/visits.ts`); what happens then depends on where the user is (`longReturnOutcome`). The
 * count of new listings lives here, in memory, for the list on screen only: a new list key drops it and aborts its
 * request.
 */

/** The list `FeedScreen` shows: its memory key (`feedScrollKey`), its search and when it was created. */
export interface FreshFeed {
  key: string;
  filters: SearchFilters;
  /** `Date.now()` when this key was first shown: the `since` of the count. */
  createdAt: number;
}

/** What `NudgeHost` sees of the app when the long return comes. */
export interface LongReturnContext {
  /** The shell's active tab is the search tab (the list, the map, or a layer over them). */
  searchTab: boolean;
  /**
   * A layer covers the list or the map: a listing, the filters sheet, a quick filter, the city or sort sheet, the radar
   * create or edit sheet, or the draw layer (`NudgeEnv.layer`).
   */
  covered: boolean;
  /** The view of the search tab under no layer. */
  view: "list" | "map";
}

export interface LongReturnInput extends LongReturnContext {
  /** `window.scrollY`, the list's position in the list view. */
  scrollY: number;
  /** The list's remembered position when its key matches (`peekFeedScroll`), else `null`: its position on the map. */
  remembered: number | null;
}

/**
 * `reload-forget`: not on the search tab — the list is re-created and its scroll memory dropped, no request.
 * `reload`: on the search tab, nothing covers the list and it is within 60 px of the top — re-created, no request.
 * `check`: otherwise — the count of new listings is asked for, and the pill shows while it is above 0.
 */
export type LongReturnOutcome = "reload-forget" | "reload" | "check";

export function longReturnOutcome(input: LongReturnInput): LongReturnOutcome {
  if (!input.searchTab) {
    return "reload-forget";
  }
  if (input.covered) {
    return "check";
  }
  const y = input.view === "list" ? input.scrollY : (input.remembered ?? 0);
  return y < MINI_CHROME_TOP_ZONE_PX ? "reload" : "check";
}

export interface FreshFeedDeps {
  /** `GET /listings/new` of `filters` since `since` (Unix seconds): a positive integer count, else `null`. */
  fetchNew: (filters: SearchFilters, since: number, signal: AbortSignal) => Promise<number | null>;
  now?: () => number;
  scrollY?: () => number;
}

export interface FreshFeedStore {
  /** `FeedScreen`: the list on screen. A new key drops the count and aborts its request; the same key keeps both. */
  show: (key: string, filters: SearchFilters) => void;
  /** The long return (`onLongReturn` of the visit tracker). */
  longReturn: (context: LongReturnContext) => void;
  /** The pill was tapped: the count goes at once, before the bumped list shows. */
  dismiss: () => void;
  count: () => number;
  feed: () => FreshFeed | null;
  subscribe: (listener: () => void) => () => void;
}

export function createFreshFeed(deps: FreshFeedDeps): FreshFeedStore {
  // Read through `Date` on every call: a clock installed after this module loaded (tests, Playwright) must count.
  const now = deps.now ?? (() => Date.now());
  const scrollY = deps.scrollY ?? (() => (typeof window === "undefined" ? 0 : window.scrollY));
  let feed: FreshFeed | null = null;
  let count = 0;
  let request: AbortController | null = null;
  const listeners = new Set<() => void>();

  const setCount = (next: number) => {
    if (next !== count) {
      count = next;
      for (const listener of [...listeners]) {
        listener();
      }
    }
  };
  const abort = () => {
    request?.abort();
    request = null;
  };

  const check = () => {
    const asked = feed;
    if (asked === null) {
      return;
    }
    abort();
    const controller = new AbortController();
    request = controller;
    deps.fetchNew(asked.filters, Math.floor(asked.createdAt / 1000), controller.signal).then(
      (answer) => {
        // An answer for another list, or one aborted by a new key, is dropped.
        if (controller.signal.aborted || feed?.key !== asked.key) {
          return;
        }
        request = null;
        setCount(answer ?? 0);
      },
      () => {
        // A failure shows nothing (API-035).
      },
    );
  };

  return {
    show: (key, filters) => {
      if (feed?.key === key) {
        return;
      }
      abort();
      feed = { key, filters, createdAt: now() };
      setCount(0);
    },
    longReturn: (context) => {
      const outcome = longReturnOutcome({
        ...context,
        scrollY: scrollY(),
        remembered: feed === null ? null : peekFeedScroll(feed.key),
      });
      if (outcome === "check") {
        check();
        return;
      }
      if (outcome === "reload-forget") {
        forgetFeedScroll();
      }
      bumpFeedEpoch();
    },
    dismiss: () => {
      abort();
      setCount(0);
    },
    count: () => count,
    feed: () => feed,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** `GET /listings/new` through `/bff` (both session modes), as the return banner asks it (`useReturnNudge`). */
async function readNew(filters: SearchFilters, since: number, signal: AbortSignal): Promise<number | null> {
  const query = toApiQuery(filters, { rules: searchRules(devFlags) });
  query.set("since", String(since));
  const result = await bffFetch<unknown>("listings/new", { query, signal });
  return result.ok ? newCount(result.data) : null;
}

/** The store of the app. */
export const freshFeed = createFreshFeed({ fetchNew: readNew });

/**
 * Where the fresh pill and the nudges may show (BR-APP-046, `NudgeEnv.allowed`): the feed list — `/` without a layer
 * parameter — with a ready session. A listing or a sheet over the feed has an address of its own.
 */
export function feedListFree(pathname: string, searchParams: URLSearchParams, ready: boolean): boolean {
  return ready && matchRoute(pathname).route === "feed" && parentOf(pathname, searchParams) === null;
}

/**
 * The long return of `NudgeHost`: the host's context after every render, and a stable `onLongReturn` for the visit
 * tracker, which keeps the callbacks of its first render.
 */
export function useFreshFeed(context: LongReturnContext): () => void {
  const latest = useRef(context);
  useEffect(() => {
    latest.current = context;
  });
  const [onLongReturn] = useState(() => () => freshFeed.longReturn(latest.current));
  return onLongReturn;
}

/** The count of the pill, `0` while there is none. */
export function useFreshCount(): number {
  return useSyncExternalStore(freshFeed.subscribe, freshFeed.count, () => 0);
}
