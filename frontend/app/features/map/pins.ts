import type { MapGroup, MapPoint } from "./types";

/**
 * Points to pins and stacks (SCR-011, BR-APP-062), shared by both engines: the grouping by location, the "N of M"
 * counts and the spiral a tapped stack spreads into. Pure; the views draw what these return.
 */

/** Points whose coordinates agree to this many decimals (about 1 m) form one stack. */
export const GROUP_DECIMALS = 5;

const GROUP_SCALE = 10 ** GROUP_DECIMALS;

/** A label box of a spread pin, in CSS pixels: the default of `spreadStackLabels` when the view measures none. */
export const SPREAD_LABEL_BOX = { width: 72, height: 28 } as const;

/** The free space kept between two spread labels and around the centre dot, in CSS pixels. */
export const SPREAD_GAP = 4;

/** The radius of the dot that marks the stack's own location while it is spread, in CSS pixels. */
export const SPREAD_DOT_RADIUS = 5;

/** The spiral walk advances this many pixels of arc between two tried positions. */
const SPREAD_STEP = 2;

function rounded(value: number): number {
  return Math.round(value * GROUP_SCALE) / GROUP_SCALE + 0;
}

/** Hundredths of a pixel, and never `-0`. */
function px(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

/** Cheapest first; a point without a USD price goes last; equal prices keep the answer's order. */
function byPrice(a: MapPoint, b: MapPoint): number {
  if (a.usd === null || b.usd === null) {
    return a.usd === null ? (b.usd === null ? 0 : 1) : -1;
  }
  return a.usd - b.usd;
}

/**
 * The pins and stacks of an answer: the points not in `hidden` (the session's hidden listings), grouped by `lat` and
 * `lon` rounded to 5 decimals, each group cheapest first with unpriced points (`usd === null`) last. A group sits at
 * the rounded coordinates and is keyed by them (`"41.31110,69.27970"`); groups keep the order of their first point.
 */
export function groupByLocation(points: readonly MapPoint[], hidden: ReadonlySet<number>): MapGroup[] {
  const groups = new Map<string, MapGroup>();
  for (const point of points) {
    if (hidden.has(point.number)) {
      continue;
    }
    const lat = rounded(point.lat);
    const lon = rounded(point.lon);
    const key = `${lat.toFixed(GROUP_DECIMALS)},${lon.toFixed(GROUP_DECIMALS)}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { key, lat, lon, items: [point] });
    } else {
      group.items.push(point);
    }
  }
  const result = [...groups.values()];
  for (const group of result) {
    group.items.sort(byPrice);
  }
  return result;
}

export type MapCounts = { shown: number; cut: number; missing: number };

/**
 * The numbers of the map's notes (BR-APP-062, BR-API-192; WP-37): `shown` = the points not hidden in this launch;
 * `cut` = the located listings the source left out of the answer, `max(0, with_point − points)`; `missing` = the
 * listings known only by district, `max(0, total − with_point)`. A missing `with_point` (an older driver) is the
 * number of points, a missing `total` is `with_point`. A hidden listing lowers `shown` only.
 */
export function mapCounts(
  points: readonly MapPoint[],
  total: number | null | undefined,
  withPoint: number | null | undefined,
  hidden: ReadonlySet<number>,
): MapCounts {
  let hiddenPoints = 0;
  for (const point of points) {
    if (hidden.has(point.number)) {
      hiddenPoints += 1;
    }
  }
  const located = withPoint ?? points.length;
  return {
    shown: points.length - hiddenPoints,
    cut: Math.max(0, located - points.length),
    missing: Math.max(0, (total ?? located) - located),
  };
}

export type SpreadOffset = { dx: number; dy: number };

type Box = { width: number; height: number };

/**
 * Where the labels of a tapped stack go (SCR-011, legacy "a widened spiral without overlaps, a dot at the centre"):
 * one offset per item in item order (cheapest first), in CSS pixels from the stack's location to the centre of the
 * item's label box, screen axes (`dy` grows downwards). The walk starts straight above the centre dot and turns
 * clockwise on an Archimedean spiral that widens by one label height plus `SPREAD_GAP` per turn; each item takes the
 * first position after the previous item's where its box keeps `SPREAD_GAP` from every placed box and from the dot,
 * so no two boxes overlap and the cheapest sit nearest. `box` is the size of the largest label (`SPREAD_LABEL_BOX`
 * when the view measures none). Pure and deterministic; both engines use it (WP-28).
 */
export function spreadStackLabels(group: MapGroup, box: Box = SPREAD_LABEL_BOX): SpreadOffset[] {
  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  const clearX = width + SPREAD_GAP;
  const clearY = height + SPREAD_GAP;
  const dotX = width / 2 + SPREAD_DOT_RADIUS + SPREAD_GAP;
  const dotY = height / 2 + SPREAD_DOT_RADIUS + SPREAD_GAP;
  const growth = clearY / (2 * Math.PI);
  const start = -Math.PI / 2;

  const placed: SpreadOffset[] = [];
  const fits = (dx: number, dy: number) =>
    (Math.abs(dx) >= dotX || Math.abs(dy) >= dotY) &&
    placed.every((other) => Math.abs(dx - other.dx) >= clearX || Math.abs(dy - other.dy) >= clearY);

  let turned = 0;
  for (let index = 0; index < group.items.length; index += 1) {
    for (;;) {
      const radius = dotY + growth * turned;
      const angle = start + turned;
      const dx = px(radius * Math.cos(angle));
      const dy = px(radius * Math.sin(angle));
      if (fits(dx, dy)) {
        placed.push({ dx, dy });
        break;
      }
      turned += SPREAD_STEP / radius;
    }
  }
  return placed;
}
