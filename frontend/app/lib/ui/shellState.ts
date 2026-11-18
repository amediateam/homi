import { useSyncExternalStore } from "react";

import { matchRoute, routes, searchKeysOf } from "@/lib/navigation/routes";

/**
 * The shell's memory for this launch (WP-23, SCR-006): module state that outlives the routes, as legacy kept filters,
 * sort and the list/map choice in memory across tabs. It is written only from effects and event handlers, so the
 * server's copy keeps its defaults and no request sees another's state.
 */

/** A pull-to-refresh handler (SCR-010): the page re-creates its list; the indicator spins until the promise settles. */
export type RefreshHandler = () => Promise<unknown>;

let searchHref: string = routes.feed();
let savedHref: string = routes.saved();
let tooSmall = false;
/** When `requestDraw()` was last called (`Date.now()`), until the map consumes it. */
let drawRequestedAt: number | null = null;

/** Per address, the handlers in the order they registered; the last one answers (a hidden copy may still hold one). */
const refreshHandlers = new Map<string, { handler: RefreshHandler }[]>();
const areaListeners = new Set<() => void>();
const refreshListeners = new Set<() => void>();

function notify(listeners: Set<() => void>): void {
  for (const listener of listeners) {
    listener();
  }
}

/** `/saved/` and `saved` → `/saved`: the key of an address in the refresh registry. */
function keyOf(pathname: string): string {
  return `/${pathname.split("/").filter(Boolean).join("/")}`;
}

/** Where the search tab returns: the last list or map address with its search state, else the feed. */
export function lastSearchHref(): string {
  return searchHref;
}

/** The search state of `lastSearchHref()`: the query the radar «+» passes to `routes.radarNew(q)` (D-SH-4). */
export function lastSearchQuery(): URLSearchParams {
  return new URLSearchParams(searchHref.split("?")[1] ?? "");
}

/** Where the saved tab returns: the favourites or the history, whichever was shown last. */
export function lastSavedHref(): string {
  return savedHref;
}

/**
 * Called by `AppShell` on every address. A search root (`/`, `/map`) is kept with its filter keys and sort only — a
 * layer (`draw`, `pin`), a sheet's `from` and foreign parameters (`listing`, `utm_*`) are not brought back by a tab
 * press. A saved root is kept as it is. Every other address leaves both alone.
 */
export function rememberHref(pathname: string, search: string | URLSearchParams): void {
  const { route } = matchRoute(pathname);
  if (route === "feed" || route === "map") {
    const query = searchKeysOf(new URLSearchParams(search));
    searchHref = route === "feed" ? routes.feed(query) : routes.map(query);
  } else if (route === "saved" || route === "history") {
    savedHref = route === "saved" ? routes.saved() : routes.history();
  }
}

/** True after a stroke too small to search in (written by the map's lasso, WP-28; the drawing bar reads it). */
export function areaTooSmall(): boolean {
  return tooSmall;
}

export function setAreaTooSmall(value: boolean): void {
  if (value !== tooSmall) {
    tooSmall = value;
    notify(areaListeners);
  }
}

function subscribeArea(listener: () => void): () => void {
  areaListeners.add(listener);
  return () => areaListeners.delete(listener);
}

export function useAreaTooSmall(): boolean {
  return useSyncExternalStore(subscribeArea, areaTooSmall, () => false);
}

/**
 * Registers the pull-to-refresh handler of an address (WP-24, WP-29, WP-30) from an effect; the returned function,
 * called in the cleanup, removes exactly this registration.
 */
export function registerRefresh(pathname: string, handler: RefreshHandler): () => void {
  const key = keyOf(pathname);
  const entry = { handler };
  refreshHandlers.set(key, [...(refreshHandlers.get(key) ?? []), entry]);
  notify(refreshListeners);
  return () => {
    const rest = (refreshHandlers.get(key) ?? []).filter((item) => item !== entry);
    if (rest.length > 0) {
      refreshHandlers.set(key, rest);
    } else {
      refreshHandlers.delete(key);
    }
    notify(refreshListeners);
  };
}

/** The handler registered last for an address, if any. */
export function refreshHandlerFor(pathname: string): RefreshHandler | undefined {
  const entries = refreshHandlers.get(keyOf(pathname)) ?? [];
  return entries[entries.length - 1]?.handler;
}

function subscribeRefresh(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

/** `refreshHandlerFor` that re-renders when a handler of any address registers or leaves (one that arrives late). */
export function useRefreshHandler(pathname: string): RefreshHandler | undefined {
  return useSyncExternalStore(
    subscribeRefresh,
    () => refreshHandlerFor(pathname),
    () => undefined,
  );
}

/** How long a draw request waits for the map (WP-28): a hand-off that did not reach it cannot start drawing later. */
export const DRAW_REQUEST_MS = 3000;

/**
 * The one-shot request to start drawing (WP-25's «Обвести на карте» in the filters sheet): the map (WP-28) consumes it
 * when it shows and opens drawing as a pushed `draw=1` layer, so Back cancels it. A later request replaces the time.
 */
export function requestDraw(): void {
  drawRequestedAt = Date.now();
}

/** Clears the request; true only if there was one younger than `DRAW_REQUEST_MS`. */
export function consumeDrawRequest(): boolean {
  const at = drawRequestedAt;
  drawRequestedAt = null;
  return at !== null && Date.now() - at < DRAW_REQUEST_MS;
}
