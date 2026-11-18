import type { DivIcon } from "leaflet";

import { clusterElement, type MarkerOptions, pinElement, spreadDotElement, spreadPinElement, stackElement } from "../markerElements";
import type { SpreadOffset } from "../pins";
import type { MapGroup, MapPoint } from "../types";
import type { LeafletModule } from "./library";

/**
 * The Leaflet icons of the map's markers (WP-28): the elements of `markerElements.ts`, shared with GL, handed to
 * `divIcon` as an element — Leaflet 1.9.4 appends an `Element` given as `html` and parses only a string — so no HTML
 * string ever carries a server label (LB-APP-020). The icon has no size of its own: `.homi-icon` (map.css) is an
 * empty box at the marker's point that centres the element on it, so the anchor is the element's centre whatever
 * its width. A marker made again keeps its element, and so its `active` class.
 */

export const ICON_CLASS = "homi-icon";

/**
 * The icon of an element, `offset` CSS pixels from the marker's point when given (a spread pin): Leaflet writes the
 * negated anchor as the empty box's margins, so the element's centre lands at the offset.
 */
export function elementIcon(L: LeafletModule, element: HTMLElement, offset?: SpreadOffset): DivIcon {
  return L.divIcon({
    html: element,
    className: ICON_CLASS,
    iconSize: undefined,
    iconAnchor: offset === undefined ? undefined : [-offset.dx, -offset.dy],
  });
}

/** An icon and the element it shows: the layer toggles `active` on the element, which Leaflet keeps across re-creations. */
export type ElementIcon = { icon: DivIcon; element: HTMLElement };

/** A location group's icon: a pin for one listing, a stack (the cheapest label and the count) for several. */
export function groupIcon(L: LeafletModule, group: MapGroup, options?: MarkerOptions): ElementIcon {
  const element = group.items.length > 1 ? stackElement(group, options) : pinElement(group.items[0], options);
  return { icon: elementIcon(L, element), element };
}

/** One listing of a spread stack, at the marker's point until the layer moves it to its place on the spiral. */
export function spreadPinIcon(L: LeafletModule, point: MapPoint, options?: MarkerOptions): ElementIcon {
  const element = spreadPinElement(point, options);
  return { icon: elementIcon(L, element), element };
}

/** A cluster: the number of listings in a circle of 32, 38 or 44 px. */
export function clusterIcon(L: LeafletModule, count: number): DivIcon {
  return elementIcon(L, clusterElement(count));
}

/** The dot at the location of a spread stack. */
export function spreadDotIcon(L: LeafletModule): DivIcon {
  return elementIcon(L, spreadDotElement());
}
