"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import { FIRST_VERSION } from "@/features/feed/feedQuery";
import type { ListingPreview } from "@/features/feed/types";
import type { FeedInitial } from "@/features/feed/useCursorFeed";
import { usePathname } from "@/i18n/navigation";
import { useSessionMap } from "@/lib/data/sessionMaps";
import { matchRoute, type RouteMatch, routes } from "@/lib/navigation/routes";
import { registerRefresh } from "@/lib/ui/shellState";

import { type SavedSource, savedListKey } from "./listKey";

/** The props the server part hands a saved screen (`readSaved`). */
export interface SavedScreenProps {
  /** The server's page one (cookie mode), `null` when the server did not read it. */
  initial: FeedInitial<ListingPreview> | null;
  /** A new value per server render of the page: a new one re-creates the list from that render (`useSavedList`). */
  renderId: string;
  /** The network rule the server saw for the photos of page one (BR-APP-059). */
  serverSmallOnly: boolean;
}

/**
 * The query of both saved lists: none, so the server's default of 20 applies (DEC-53). One object for every render,
 * as `useCursorFeed` asks of a query; it is never written to (a later page copies it to add the cursor).
 */
export const SAVED_QUERY: URLSearchParams = new URLSearchParams();

/**
 * Gives the focus to the list (`ListingFeed`'s root, or history's cleared state, both `tabIndex={-1}` with
 * `data-feed`) when it was lost: nothing or the body has it, the element left the document, or it sits in a part that
 * is no longer shown (a listing's layer hidden by `<Activity>`). A focus the user still sees, a title tab or the tab
 * bar, stays where it is (WCAG 2.4.3).
 */
export function focusSavedListIfLost(source: SavedSource): void {
  const active = document.activeElement;
  const lost =
    active === null ||
    active === document.body ||
    !active.isConnected ||
    (typeof active.checkVisibility === "function" && !active.checkVisibility());
  if (lost) {
    document.querySelector<HTMLElement>(`[data-feed="${source}"]`)?.focus({ preventScroll: true });
  }
}

/** The route of each list's own address (`matchRoute`). */
const OWN_ROUTE: Record<SavedSource, RouteMatch["route"]> = { favorites: "saved", history: "history" };

/**
 * The list version of one server render. `seen` is the size of the launch's `seen` map the list was last created
 * with: history re-creates its list when the map has grown since (SCR-025). `shown` is whether the list's own
 * address was shown at the last render, so its return is seen as a change.
 */
interface Versioned {
  renderId: string;
  version: number;
  seen: number;
  shown: boolean;
}

/**
 * The list key of a saved screen (SCR-024, SCR-025; `savedListKey`) and the settling of its pulls. Each server render
 * of the page brings a new `renderId` — the tab bar or a title tab entering the page again — and starts again from
 * `FIRST_VERSION`, the version of the server's page one, so the list is re-created from that render: the server's
 * page one when it was read (cookie mode), else one `/bff` request. Returning from a listing over the list does not
 * render the page again, so the list stays.
 *
 * A pull (BR-APP-058) bumps the version, re-creates the list from page one through `/bff`, and the indicator spins
 * until page one has answered (`onFirstPage`). History also bumps it once when its address comes back after the
 * launch opened a listing (`seen` grew; legacy keyed the list by the size of `seen`, re-creating it under the
 * listing's layer): the check runs while rendering, only on the render where the address is shown again after
 * another one (Back from the listing), never on the tap that marks the listing seen while the list is still shown.
 * A tab entering the page brings a new `renderId` instead, which latches the size anew. Every new version latches
 * the current size. Favourites have no such rule. A new key scrolls to the top before it is painted while the list's
 * own address is shown, never on the first render, and gives the list the focus when it was lost: the card a listing
 * returns the focus to is gone once the list is re-created (`focusSavedListIfLost`).
 */
export function useSavedList(source: SavedSource, renderId: string): { listKey: string; onFirstPage: () => void } {
  const seen = useSessionMap("seen");
  const own = matchRoute(usePathname()).route === OWN_ROUTE[source];

  const [stored, setVersioned] = useState<Versioned>(() => ({ renderId, version: FIRST_VERSION, seen: seen.size, shown: own }));
  // Adjusted while rendering, as `FeedScreen` does, so no frame shows the list left behind.
  let versioned = stored;
  if (stored.renderId !== renderId) {
    // A new server render: the pulls and the latch of the one left behind are forgotten.
    versioned = { renderId, version: FIRST_VERSION, seen: seen.size, shown: own };
  } else if (stored.shown !== own) {
    // The address left or came back; only its return can re-create history, and only once per growth of `seen`.
    const grown = own && source === "history" && seen.size !== stored.seen;
    versioned = grown ? { ...stored, version: stored.version + 1, seen: seen.size, shown: own } : { ...stored, shown: own };
  }
  if (versioned !== stored) {
    setVersioned(versioned);
  }
  const listKey = savedListKey(source, versioned.renderId, versioned.version);

  /** A pull's new version of the render shown, latching the size of `seen` it is created with. */
  const bump = useEffectEvent(() => {
    setVersioned((current) => ({ ...current, version: current.version + 1, seen: seen.size }));
  });

  const waiting = useRef<(() => void)[]>([]);
  const settlePulls = useCallback(() => {
    const pulls = waiting.current;
    waiting.current = [];
    for (const resolve of pulls) {
      resolve();
    }
  }, []);
  const path = source === "favorites" ? routes.saved() : routes.history();
  useEffect(() => {
    const unregister = registerRefresh(
      path,
      () =>
        new Promise<void>((resolve) => {
          waiting.current.push(resolve);
          bump();
        }),
    );
    // A hidden list ends the pull: the list it waited for is paused.
    return () => {
      unregister();
      settlePulls();
    };
  }, [path, settlePulls]);

  const scrolledFor = useRef(listKey);
  useLayoutEffect(() => {
    if (own && scrolledFor.current !== listKey) {
      scrolledFor.current = listKey;
      window.scrollTo(0, 0);
      focusSavedListIfLost(source);
    }
  }, [own, listKey, source]);

  return { listKey, onFirstPage: settlePulls };
}
