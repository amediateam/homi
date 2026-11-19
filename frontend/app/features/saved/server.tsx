import { io } from "next/cache";

import { FIRST_VERSION } from "@/features/feed/feedQuery";
import { smallPhotosOnly } from "@/features/feed/FeedServer";
import { serverApi } from "@/lib/api/server";
import { getSessionToken } from "@/lib/session/server";

import { FavoritesScreen } from "./FavoritesScreen";
import { HistoryScreen } from "./HistoryScreen";
import { type SavedSource, savedListKey } from "./listKey";
import type { SavedScreenProps } from "./useSavedList";

/**
 * Page one of a saved list with the session cookie (DEC-44, `25` §3.4), or `null`, and the `renderId` of this server
 * render. `GET /favorites` or `GET /history` is asked with no query: no `limit`, the server's default of 20 is the page
 * (DEC-53). The `renderId` is new on every render of the page (the tab bar or a title tab entering it again), so the
 * screen re-creates its list from this render. It is drawn after `io()`, not merely after the cookie read: with
 * `partialPrefetching` the cookie and the headers resolve in the runtime shell stage, where a random value would
 * abort the runtime prefetch of the route and log an error (`io.md`); `io()` moves it to the dynamic stage, as
 * `serverApi` does for its request id. A request without the cookie (header mode, the first request of a launch) and an `unauthorized` answer
 * leave page one to the browser, which asks once the bootstrap has signed in again (WP-21). Any other failure is
 * passed on, not thrown: the list shows its error state and «Повторить» asks the browser. Nothing here is cached.
 */
export async function readSaved(source: SavedSource): Promise<SavedScreenProps> {
  const serverSmallOnly = await smallPhotosOnly();
  const token = await getSessionToken();
  await io();
  const renderId = crypto.randomUUID();
  if (token === null) {
    return { initial: null, renderId, serverSmallOnly };
  }
  const api = await serverApi();
  const result = source === "favorites" ? await api.favorites() : await api.history();
  if (!result.ok && result.error === "unauthorized") {
    return { initial: null, renderId, serverSmallOnly };
  }
  return { initial: { key: savedListKey(source, renderId, FIRST_VERSION), result }, renderId, serverSmallOnly };
}

/** Favourites (SCR-024): the part of `/saved` that reads the cookie, inside the page's `<Suspense>`. */
export async function FavoritesServer() {
  return <FavoritesScreen {...await readSaved("favorites")} />;
}

/** History «Смотрели» (SCR-025): the part of `/saved/history` that reads the cookie, inside the page's `<Suspense>`. */
export async function HistoryServer() {
  return <HistoryScreen {...await readSaved("history")} />;
}
