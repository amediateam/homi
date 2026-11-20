import { type CityRef, normalizeSort, sortOptions, toSearchParams } from "@homi/search";

import { routes } from "@/lib/navigation/routes";
import { searchStateFromHref } from "@/lib/search/readSearchState";

import type { Radar } from "./normalize";

/**
 * The return to a radar sheet (SCR-028, WP-30 "Return from a radar feed"; legacy `radarReturn` / `resume` of
 * `App.jsx` and `RadarScreen.jsx`): module memory of this launch. «Смотреть найденное» and a find of the strip store it
 * before they leave the sheet; when that radar's sheet is shown again (Back), it opens without the rise (`instant`,
 * legacy `.instant`), the tab below scrolls back to `scrollY`, and the sheet's body and the strip go back to where
 * they were (WP-38, DEC-64: legacy keeps the sheet mounted, HOMI re-opens it and restores both). A tile tap and a tab
 * press forget it (legacy `switchTab` cleared it), so a later opening rises as usual.
 */
export interface RadarReturn {
  id: string;
  /** `window.scrollY` of the radar tab when the sheet was left. */
  scrollY: number;
  /** What the sheet was left for: the radar's feed («Смотреть найденное») or a find of the strip. */
  via: "feed" | "listing";
  /** `scrollLeft` of the strip of finds. */
  stripX: number;
  /** `scrollTop` of the sheet's body. */
  sheetY: number;
}

/** Where the sheet was left: what for, and its two scrolls. */
export type RadarPlace = Pick<RadarReturn, "via" | "stripX" | "sheetY">;

const AT_TOP: RadarPlace = { via: "listing", stripX: 0, sheetY: 0 };

let pending: RadarReturn | null = null;

const position = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);

/** Stores the return to the sheet of `id`, replacing any other. */
export function rememberRadarReturn(id: string, scrollY: number, place: RadarPlace = AT_TOP): void {
  pending = { id, scrollY: position(scrollY), via: place.via, stripX: position(place.stripX), sheetY: position(place.sheetY) };
}

/** The stored return when it is the sheet of `id` (either case), else `null`; it stays stored. */
export function peekRadarReturn(id: string): RadarReturn | null {
  return pending !== null && pending.id.toUpperCase() === id.toUpperCase() ? pending : null;
}

/** Forgets the stored return. */
export function clearRadarReturn(): void {
  pending = null;
}

/**
 * The address of «Смотреть найденное» (SCR-028): the feed of the radar's filters with the sort of the user's last
 * search when the radar's city offers it, else `new` (legacy `ensureSortFits`, BR-APP-023), and `from=radar` — the
 * mark that keeps the user's own search in the shell's memory (`rememberHref`) until a change on that feed or a tab
 * press makes the radar's filters the search. `city` is the radar's city in the reference data (`null` while it is
 * not known: the basic sorts only).
 */
export function radarFeedHref(radar: Pick<Radar, "filters">, lastSearchHref: string, city: CityRef | null): string {
  const lastSort = searchStateFromHref(lastSearchHref).sort;
  const params = toSearchParams(radar.filters, normalizeSort(lastSort, sortOptions(radar.filters, city)));
  params.set("from", "radar");
  return routes.feed(params);
}
