"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

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

/** One showing of the sheet and the return it opened with (`peekRadarReturn`), read when the showing starts. */
interface Opening {
  count: number;
  return: RadarReturn | null;
}

/**
 * The radar sheet of `/radars/<id>` in both route trees (SCR-028, DEC-44): the layout of the segment, so it stays
 * mounted under its editor. It reads the tab's list (`useRadars({ previews: true })`, the key the tab below already
 * holds) and renders `RadarSheet` for the radar of its own id.
 *
 * - Radars switched off (DEC-51): `useRadarsOffRedirect` replaces the address with the tab and nothing renders.
 * - A radar the loaded list does not hold (deleted in the bot, a stale link): `nav.replace(routes.radars())`, once
 *   the list is there; not while the sheet leaves by itself (a delete).
 * - The standalone copy (a direct load) stays in the `children` slot while Next intercepts the next soft navigation
 *   into a slot — a find's listing into `@overlay`, the survey into `@sheet` (`router.replace` is intercepted as
 *   `push` is: both dispatch the same navigate action with the same `Next-Url`, only the history entry differs). It
 *   shows only while the address is this radar's own (`/radars/<id>` or its editor), as the `@sheet` copy does
 *   through its slot, so Back from the listing brings it back.
 * - Each showing is an opening (`useLayoutEffect` cleanup when `<Activity>` hides the layer copy, as
 *   `ListingLayer` does, or the standalone copy's address leaving): the sheet is mounted anew, and when a return to
 *   this radar is stored («Смотреть найденное», a find; `radarReturn`) it opens without the rise and the tab below
 *   scrolls back to where it was. The return is then forgotten.
 */
export function RadarSheetRoute({ id, presentation, flags = devFlags, children }: RadarSheetRouteProps) {
  const off = useRadarsOffRedirect();
  const matched = matchRoute(usePathname());
  const own = matched.route === "radar" && sameId(matched.id, id);
  const shown = !off && (presentation === "layer" || own);
  const { radars } = useRadars({ previews: true, enabled: shown, flags });
  const found = radars?.find((item) => sameId(item.id, id));

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

  const [opening, setOpening] = useState<Opening>(() => ({ count, return: peekRadarReturn(id) }));
  const [leaving, setLeaving] = useState(false);
  const [kept, setKept] = useState<Radar | undefined>(found);
  let current = opening;
  if (opening.count !== count) {
    current = { count, return: peekRadarReturn(id) };
    setOpening(current);
    setLeaving(false);
  }
  if (found !== undefined && found !== kept) {
    setKept(found);
  }

  // The showing starts: the stored return is taken — the tab below scrolls back — and forgotten. Only a return still
  // stored counts: a hidden copy may have prepared its opening before a tab press or a tile tap forgot it (that
  // opening then only skips the rise).
  const taken = useRef<Opening | null>(null);
  useLayoutEffect(() => {
    if (!shown || taken.current === current) {
      return undefined;
    }
    taken.current = current;
    const stored = peekRadarReturn(id);
    if (stored === null) {
      return undefined;
    }
    clearRadarReturn();
    window.scrollTo(0, stored.scrollY);
    // The tab below is shown again in the same commit; a late scroll of the browser's own restoration loses to this.
    const frame = requestAnimationFrame(() => window.scrollTo(0, stored.scrollY));
    return () => cancelAnimationFrame(frame);
  }, [shown, current, id]);

  const unknown = shown && !leaving && radars !== undefined && found === undefined;
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
      radar={found ?? (leaving ? kept : undefined)}
      presentation={presentation}
      instant={current.return !== null}
      onLeave={() => setLeaving(true)}
      flags={flags}
    >
      {children}
    </RadarSheet>
  );
}
