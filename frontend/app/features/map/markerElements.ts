import { type MapGroup, type MapPoint, PIN_TONES, type PinTone } from "./types";

/**
 * The DOM of the map's markers (SCR-011, KV-FE-058): a price pin, a stack, a cluster and the dot at the centre of a
 * spread stack, styled by `features/map/map.css`, shared by both engines: GL places the roots as markers, Leaflet as
 * `divIcon` elements (WP-28). No engine is imported here. Every server string is set with `textContent` on nodes made by `createElement`
 * (LB-APP-020); the classes are fixed names, a tone only when it is one of `PIN_TONES`. For tests, `data-marker` names
 * the kind (`pin`, `stack`, `cluster`, `spread`, `dot`), `data-number` the listing, `data-key` the group and
 * `data-count` the listings of a stack or a cluster. The engine owns each root's position and transform.
 */

export type MarkerOptions = { active?: boolean };

/** The diameter of a cluster circle in px: fewer than 10 listings, fewer than 50, more. */
export function clusterSize(count: number): 32 | 38 | 44 {
  return count < 10 ? 32 : count < 50 ? 38 : 44;
}

function isTone(tone: string | null): tone is PinTone {
  return tone !== null && (PIN_TONES as readonly string[]).includes(tone);
}

/** `pin`, the tone, `nego` for a listing without a price and `active`. */
function pinClasses(el: HTMLElement, point: MapPoint, active: boolean): void {
  el.classList.add("pin");
  if (isTone(point.tone)) {
    el.classList.add(point.tone);
  }
  if (!point.priced) {
    el.classList.add("nego");
  }
  setActive(el, active);
}

/** One listing: its server label as text. */
export function pinElement(point: MapPoint, { active = false }: MarkerOptions = {}): HTMLElement {
  const el = document.createElement("div");
  pinClasses(el, point, active);
  el.dataset.marker = "pin";
  el.dataset.number = String(point.number);
  el.textContent = point.label;
  return el;
}

/** One listing of a tapped stack, laid out around the stack's dot: a pin that tests can tell from a plain one. */
export function spreadPinElement(point: MapPoint, options: MarkerOptions = {}): HTMLElement {
  const el = pinElement(point, options);
  el.dataset.marker = "spread";
  return el;
}

/** Several listings at one location: the cheapest one's label and tone (groups come cheapest first) and the count. */
export function stackElement(group: MapGroup, { active = false }: MarkerOptions = {}): HTMLElement {
  const [cheapest] = group.items;
  const el = document.createElement("div");
  pinClasses(el, cheapest, active);
  el.classList.add("stack");
  el.dataset.marker = "stack";
  el.dataset.key = group.key;
  el.dataset.count = String(group.items.length);
  const label = document.createElement("span");
  label.textContent = cheapest.label;
  const count = document.createElement("span");
  count.className = "pin-n";
  count.textContent = String(group.items.length);
  el.append(label, count);
  return el;
}

/** A cluster below maximum zoom: a circle with the number of listings, 32 / 38 / 44 px. */
export function clusterElement(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "cluster";
  const size = `${clusterSize(count)}px`;
  el.style.width = size;
  el.style.height = size;
  el.dataset.marker = "cluster";
  el.dataset.count = String(count);
  el.textContent = String(count);
  return el;
}

/** The dot left at the location of a spread stack. */
export function spreadDotElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "spread-dot";
  el.dataset.marker = "dot";
  return el;
}

/** Raises or lowers a pin or a stack; the selected one sits above every other marker (`--z-pin`). */
export function setActive(el: HTMLElement, on: boolean): void {
  el.classList.toggle("active", on);
}
