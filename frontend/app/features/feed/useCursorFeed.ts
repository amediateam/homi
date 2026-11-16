"use client";

import { useCallback, useEffect, useState } from "react";

import type { BffRead } from "@/lib/api/bffAllowList";
import { bffFetch } from "@/lib/api/browser";
import { type ApiFailure, failureOf } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import type { DataSource } from "@/lib/data/sources";
import { type DevFlags, devFlags } from "@/lib/flags";
import { onForbidden } from "@/lib/session/bootstrap";

/** The cursor lists of `/api/v1` (DEC-53): the search feed here, favourites and history of WP-29. */
export type CursorPath = Extract<BffRead, "listings" | "favorites" | "history">;

/** The server's read of page one (cookie mode), with the list key it was read for; a failure is passed on, not thrown. */
export interface FeedInitial<T> {
  key: string;
  result: ApiResult<T[]>;
}

export interface CursorFeedOptions<T> {
  /** The list key: a new key re-creates the list from page one. */
  key: string;
  path: CursorPath;
  /**
   * The query of page one; a later page adds `cursor`. The caller owns `limit` (the feed sends 20, WP-29 none). For
   * one `key` it must serialise the same on every render: a change aborts the pending page and sends it again.
   */
  query: URLSearchParams;
  /** Adopted only when `initial.key` equals `key`, at the start of that key's list. */
  initial?: FeedInitial<T> | null;
  /** Gates sending only (`useSession().status === 'ready'`): adopted items render whatever the session status. */
  enabled: boolean;
  /**
   * The session was signed in by this launch (`useSession().renewed`): a page one adopted before `enabled` was read
   * with the document's cookie, another user's or a revoked one, and is asked for again once `enabled`.
   */
  renewed?: boolean;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

/** `loading` until page one has answered (skeletons, also while `enabled` is false); `error` while a page failed. */
export type CursorFeedStatus = "loading" | "success" | "error";

export interface CursorFeed<T> {
  items: readonly T[];
  status: CursorFeedStatus;
  /** The failure of the last page asked for; `null` once `retry()` asks again. */
  error: ApiFailure | null;
  /** The list ended: a `null`, missing or already used cursor. Never true after an error. */
  done: boolean;
  /** A later page is asked for while items are shown (the spinner at the sentinel). */
  loadingMore: boolean;
  /** Asks for the next page; ignored while one is asked for, after an error and when done. */
  loadMore: () => void;
  /** Asks again for the page that failed, and only for it. */
  retry: () => void;
  /** `meta.source` of the latest answer, the server's included (the demo marker, `25` §4.4). */
  source: DataSource | undefined;
}

/** A page asked for: `cursor` `null` is page one. A new object per request, so an answer is matched to its request. */
interface Page {
  cursor: string | null;
}

interface State<T> {
  key: string;
  items: readonly T[];
  numbers: ReadonlySet<number>;
  /** Page one has answered. */
  loaded: boolean;
  /** Page one is the server's `initial`, adopted while not `enabled`: `renewed` decides on it once `enabled`. */
  early: boolean;
  /** The cursor of the next page; `null` before page one and when done. */
  next: string | null;
  /** The cursors already sent; one that comes back ends the list (LB-APP-022). */
  used: ReadonlySet<string>;
  done: boolean;
  error: ApiFailure | null;
  /** The page asked for now; the effect sends it while `enabled`. */
  request: Page | null;
  source: DataSource | undefined;
}

function merge<T extends { number: number }>(state: State<T>, items: readonly T[]): Pick<State<T>, "items" | "numbers"> {
  const numbers = new Set(state.numbers);
  const added: T[] = [];
  for (const item of items) {
    if (!numbers.has(item.number)) {
      numbers.add(item.number);
      added.push(item);
    }
  }
  return added.length === 0 ? { items: state.items, numbers: state.numbers } : { items: [...state.items, ...added], numbers };
}

/** The state after the answer to `page`. */
function settle<T extends { number: number }>(state: State<T>, page: Page, result: ApiResult<T[]>): State<T> {
  if (!result.ok) {
    return { ...state, error: result, request: null };
  }
  const used = page.cursor === null ? state.used : new Set(state.used).add(page.cursor);
  const cursor = result.meta.next_cursor;
  const ended = typeof cursor !== "string" || cursor === "" || used.has(cursor);
  return {
    ...state,
    ...merge(state, result.data),
    loaded: true,
    next: ended ? null : cursor,
    used,
    done: ended,
    error: null,
    request: null,
    source: result.meta.source ?? state.source,
  };
}

/** A new list for `key`: the server's page one when it was read for this key, else page one asked for. */
function start<T extends { number: number }>(key: string, initial: FeedInitial<T> | null | undefined, enabled: boolean): State<T> {
  const empty: State<T> = {
    key,
    items: [],
    numbers: new Set(),
    loaded: false,
    early: false,
    next: null,
    used: new Set(),
    done: false,
    error: null,
    request: { cursor: null },
    source: undefined,
  };
  return initial?.key === key ? settle({ ...empty, early: !enabled, request: null }, { cursor: null }, initial.result) : empty;
}

/**
 * One cursor list of WP-24 (BR-APP-024, DEC-53), shared by the feed and WP-29's favourites and history. Page one is
 * the server's `initial` (cookie mode) when its key matches, else one `bffFetch` of `path` with `query`; a later page
 * repeats the query with the last `meta.next_cursor`. A `null`, missing or already used cursor ends the list (the
 * fix of LB-APP-022), and an item whose `number` was shown is skipped. Nothing retries by itself; `retry()` repeats
 * the failed page. A new `key` starts a new list and drops the answer in flight.
 *
 * Every request lives in an effect and is aborted by its cleanup: on a new key, on unmount and while the route is
 * hidden by `cacheComponents` (`preserving-ui-state.md`) — a hidden list keeps its items and asks for the pending
 * page again when shown. A later `initial` for the same key (the router refresh after a sign-in, a tab tapped back to
 * the list) is not adopted: the list already has its page one. A page one adopted before the session was ready is
 * kept once it is, unless the launch signed in (`renewed`): then it was read with another cookie than the session's,
 * and the list starts again from page one asked for. With `dev001AnyForbiddenShowsAccess` a `forbidden` page turns
 * the session `denied`, as `useResource` does (LB-APP-045).
 */
export function useCursorFeed<T extends { number: number }>(options: CursorFeedOptions<T>): CursorFeed<T> {
  const { key, path, query, initial, enabled, renewed = false, flags = devFlags } = options;
  const [stored, setState] = useState<State<T>>(() => start(key, initial, enabled));
  let state = stored;
  if (stored.key !== key) {
    // A new list during render (React's "adjusting state when a prop changes"): no frame shows the old items.
    state = start(key, initial, enabled);
  }
  if (enabled && state.early) {
    state = renewed ? start(key, null, enabled) : { ...state, early: false };
  }
  if (state !== stored) {
    setState(state);
  }

  const { request } = state;
  const search = query.toString();
  useEffect(() => {
    if (!enabled || request === null) {
      return undefined;
    }
    const controller = new AbortController();
    const params = new URLSearchParams(search);
    if (request.cursor !== null) {
      params.set("cursor", request.cursor);
    }
    const apply = (result: ApiResult<T[]>) => {
      // The abort drops an answer after a committed change; the key and request check, one that lands while a render
      // with a new key (a navigation's transition) has not committed yet.
      if (!controller.signal.aborted) {
        setState((current) => (current.key === key && current.request === request ? settle(current, request, result) : current));
      }
    };
    bffFetch<T[]>(path, { query: params, signal: controller.signal }).then(apply, () => {
      // `bffFetch` rejects only for the abort of its caller; anything else is a bug, shown as "could not load".
      apply(failureOf({ method: "GET", path }, { status: 0 }));
    });
    return () => controller.abort();
  }, [enabled, request, key, path, search]);

  const forbidden = state.error?.error === "forbidden";
  useEffect(() => {
    if (enabled && forbidden && flags.dev001AnyForbiddenShowsAccess) {
      onForbidden();
    }
  }, [enabled, forbidden, flags]);

  const loadMore = useCallback(() => {
    setState((current) =>
      current.key === key && current.next !== null && current.error === null && current.request === null
        ? { ...current, request: { cursor: current.next } }
        : current,
    );
  }, [key]);

  const retry = useCallback(() => {
    setState((current) =>
      current.key === key && current.error !== null && current.request === null
        ? { ...current, error: null, request: { cursor: current.loaded ? current.next : null } }
        : current,
    );
  }, [key]);

  return {
    items: state.items,
    status: state.error !== null ? "error" : state.loaded ? "success" : "loading",
    error: state.error,
    done: state.done,
    loadingMore: state.loaded && state.request !== null,
    loadMore,
    retry,
    source: state.source,
  };
}
