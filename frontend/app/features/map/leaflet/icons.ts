import type { DivIcon } from "leaflet";

import { clusterElement, type MarkerOptions, pinElement, spreadDotElement, spreadPinElement, stackElement } from "../markerElements";
import type { MapGroup, MapPoint } from "../types";
import type { LeafletModule } from "./library";

/**
 * The Leaflet icons of the map's markers (WP-28): the elements of `markerElements.ts`, shared with GL, handed to
 * `divIcon` as an element — Leaflet 1.9.4 appends an `Element` given as `html` and parses only a string — so no HTML
 * string ever carries a server label (LB-APP-020). The icon has no size of its own: `.homi-icon` (map.css) is an
 * empty box at the marker's point that centres the element on it, so the anchor is the element's centre whatever
 * its width.
 */

const ICON_CLASS = "homi-icon";

function iconOf(L: LeafletModule, element: HTMLElement): DivIcon {
  return L.divIcon({ html: element, className: ICON_CLASS, iconSize: undefined });
}

export function pinIcon(L: LeafletModule, point: MapPoint, options?: MarkerOptions): DivIcon {
  return iconOf(L, pinElement(point, options));
}

export function spreadPinIcon(L: LeafletModule, point: MapPoint, options?: MarkerOptions): DivIcon {
  return iconOf(L, spreadPinElement(point, options));
}

export function stackIcon(L: LeafletModule, group: MapGroup, options?: MarkerOptions): DivIcon {
  return iconOf(L, stackElement(group, options));
}

export function clusterIcon(L: LeafletModule, count: number): DivIcon {
  return iconOf(L, clusterElement(count));
}

export function spreadDotIcon(L: LeafletModule): DivIcon {
  return iconOf(L, spreadDotElement());
}
