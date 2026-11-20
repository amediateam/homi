"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { forgetFeedScroll } from "@/features/feed/feedScroll";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { usePathname } from "@/i18n/navigation";
import { type DevFlags, devFlags } from "@/lib/flags";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";

import type { Radar } from "./normalize";
import { clearRadarReturn, peekRadarReturn, type RadarReturn } from "./radarReturn";
import { RadarSheet } from "./RadarSheet";
import { useRadars } from "./useRadars";
import { useRadarsOffRedirect } from "./useRadarsOffRedirect";

export interface RadarSheetRouteProps {
  /** The radar id of the layout's own `params` (a ULID; `RadarSheetServer` checked it). */
  id: string;
  presentation: RoutePresentation;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
  /** The editor's route. */
  children?: ReactNode;
}

const sameId = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();

/**
 * One showing of the sheet: the return it opened with (`peekRadarReturn`), and whether it takes the sheet over from the
 * other copy shown at that moment (`handover`), both read when the showing is prepared.
 */
interface Opening {
  count: number;
  return: RadarReturn | null;
  handover: boolean;
}

/** The copies of a radar sheet showing it now, per tree: each copy counts itself while it renders its sheet. */
const shownCopies: Record<RoutePresentation, number> = { layer: 0, standalone: 0 };
const copyListeners = new Set<() => void>();

function countCopy(presentation: RoutePresentation, change: 1 | -1): void {
  shownCopies[presentation] += change;
  for (const listener of copyListeners) {
    listener();
  }
}

function subscribeCopies(listener: () => void): () => void {
  copyListeners.add(listener);
  return () => copyListeners.delete(listener);
}

const layerCopyShown = (): boolean => shownCopies.layer > 0;

/** The other tree's copy shows the sheet now: an opening prepared at this moment takes the sheet over from it. */
const otherCopyShown = (presentation: RoutePresentation): boolean =>
  shownCopies[presentation === "layer" ? "standalone" : "layer"] > 0;

/**
 * The radar sheet of `/radars/<id>` in both route trees (SCR-028, DEC-44): the layout of the segment, so it stays
 * mounted under its editor. It reads the tab's list (`useRadars({ previews: true })`, the key the tab below already
 * holds) and renders `RadarSheet` for the radar of its own id.
 *
 * - Radars switched off (DEC-51): `useRadarsOffRedirect` replaces the address with the tab and nothing renders.
 * - A radar the loaded list does not hold (deleted in the bot, a stale link): `nav.replace(routes.radars())`, once
 *   the list is there; not while the sheet leaves by itself (a delete).
 * - Both copies show only while the address is this radar's own (`/radars/<id>` or its editor). A slot is no such
 *   rule: Next intercepts a find's listing into `@overlay` and leaves `@sheet` as it was, so the `@sheet` copy would
 *   stay open over the listing (and a copy `<Activity>` hides keeps its portalled dialog). The standalone copy (a
 *   direct load) likewise stays in the `children` slot while Next intercepts the next soft navigation into a slot —
 *   a find's listing into `@overlay`, the survey into `@sheet` (`router.replace` is intercepted as `push` is: both
 *   dispatch the same navigate action with the same `Next-Url`, only the history entry differs). Back from the
 *   listing brings the sheet back.
 * - The standalone copy yields while a `@sheet` copy shows the sheet (the copies count themselves, as the overlay
 *   copies of `ListingLayer` do): the editor opened from a directly loaded sheet, or Back from a directly loaded editor
 *   (`replace` to the sheet, intercepted into `@sheet`), would otherwise stack two sheets and their dims, and the
 *   standalone editor (its `children`) would stay open. Not a latch: Back to the direct load hides the `@sheet` copy
 *   and the standalone copy shows again. A copy that takes the sheet over from the other one opens without the rise.
 * - Each showing is an opening (`useLayoutEffect` cleanup when `<Activity>` hides a copy, as `ListingLayer` does, or
 *   the address leaving): the sheet is mounted anew, and when a return to this radar is stored («Смотреть
 *   найденное», a find; `radarReturn`) it opens without the rise and, once the list is there (the tab below renders
 *   its tiles in the same commit), the tab scrolls back to where it was. The return is then forgotten. While the list
 *   is read again (a radar write elsewhere dropped it) the sheet keeps the radar it last showed.
 */
export function RadarSheetRoute({ id, presentation, flags = devFlags, children }: RadarSheetRouteProps) {
  const off = useRadarsOffRedirect();
  const matched = matchRoute(usePathname());
  const own = !off && matched.route === "radar" && sameId(matched.id, id);
  const layerShown = useSyncExternalStore(subscribeCopies, layerCopyShown, () => false);
  const shown = own && !(presentation === "standalone" && layerShown);
  const { radars } = useRadars({ previews: true, enabled: shown, flags });
  const found = radars?.find((item) => sameId(item.id, id));
  const loaded = radars !== undefined;

  useLayoutEffect(() => {
    if (!shown) {
      return undefined;
    }
    countCopy(presentation, 1);
    return () => countCopy(presentation, -1);
  }, [presentation, shown]);

  const [count, setCount] = useState(0);
  const [wasShown, setWasShown] = useState(shown);
  if (wasShown !== shown) {
    setWasShown(shown);
    if (!shown) {
      setCount((value) => value + 1);
    }
  }
  // Hidden (`<Activity>`) or unmounted: the next showing is a new opening.
  useLayoutEffect(() => () => setCount((value) => value + 1), []);

  const [opening, setOpening] = useState<Opening>(() => ({ count, return: peekRadarReturn(id), handover: otherCopyShown(presentation) }));
  const [leaving, setLeaving] = useState(false);
  const [kept, setKept] = useState<Radar | undefined>(found);
  let current = opening;
  if (opening.count !== count) {
    current = { count, return: peekRadarReturn(id), handover: otherCopyShown(presentation) };
    setOpening(current);
    setLeaving(false);
  }
  if (found !== undefined && found !== kept) {
    setKept(found);
  }

  // The showing starts and the list is there: the stored return is taken — the tab below, which renders its tiles in
  // the same commit, scrolls back — and forgotten. Only a return still stored counts: a hidden copy may have prepared
  // its opening before a tab press or a tile tap forgot it (that opening then only skips the rise).
  const taken = useRef<Opening | null>(null);
  useLayoutEffect(() => {
    if (!shown || !loaded || taken.current === current) {
      return undefined;
    }
    taken.current = current;
    const stored = peekRadarReturn(id);
    if (stored === null) {
      return undefined;
    }
    clearRadarReturn();
    if (stored.via === "feed") {
      // The Back from a radar's feed drops the search list's position (BR-APP-105).
      forgetFeedScroll();
    }
    window.scrollTo(0, stored.scrollY);
    // The tab below is shown again in the same commit; a late scroll of the browser's own restoration loses to this.
    const frame = requestAnimationFrame(() => window.scrollTo(0, stored.scrollY));
    return () => cancelAnimationFrame(frame);
  }, [shown, loaded, current, id]);

  const unknown = shown && !leaving && loaded && found === undefined;
  useEffect(() => {
    if (unknown) {
      nav.replace(routes.radars());
    }
  }, [unknown]);

  if (!shown) {
    return null;
  }
  return (
    <RadarSheet
      key={current.count}
      id={id}
      radar={found ?? (leaving || !loaded ? kept : undefined)}
      presentation={presentation}
      instant={current.return !== null || current.handover}
      restore={current.return}
      onLeave={() => setLeaving(true)}
      flags={flags}
    >
      {children}
    </RadarSheet>
  );
}
