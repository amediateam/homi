import type { Polygon } from "@homi/search";

/**
 * The area mask (SCR-011): with a polygon in the filters, the world outside it is dimmed and the polygon is outlined.
 * GeoJSON positions are `[lon, lat]`; rings follow RFC 7946 §3.1.6 (exterior counter-clockwise, holes clockwise).
 */

/** A GeoJSON position. */
export type Position = [lon: number, lat: number];

/** The dimmed world with the polygon as its hole. */
export type MaskFeature = {
  type: "Feature";
  properties: { kind: "mask" };
  geometry: { type: "Polygon"; coordinates: [world: Position[], hole: Position[]] };
};

/** The polygon's outline. */
export type OutlineFeature = { type: "Feature"; properties: { kind: "outline" }; geometry: { type: "LineString"; coordinates: Position[] } };

/** A GeoJSON FeatureCollection (what a GeoJSON source's `data` takes); the `kind` property tells the two parts apart. */
export type MaskGeometry = { type: "FeatureCollection"; features: [MaskFeature, OutlineFeature] };

/** The Web Mercator world ends here; the world rectangle reaches a hair beyond so no edge is left undimmed. */
const WORLD_LAT = 85.051129;
const WORLD_LON = 180;

/** The world rectangle, counter-clockwise. */
const WORLD_RING: Position[] = [
  [-WORLD_LON, -WORLD_LAT],
  [WORLD_LON, -WORLD_LAT],
  [WORLD_LON, WORLD_LAT],
  [-WORLD_LON, WORLD_LAT],
  [-WORLD_LON, -WORLD_LAT],
];

/** Twice the signed area of a closed `[lon, lat]` ring (shoelace): positive when counter-clockwise. */
function signedArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return sum;
}

/** The polygon's vertices as a closed GeoJSON ring: `[lon, lat]`, the first position repeated at the end. */
export function ringOf(polygon: Polygon): Position[] {
  const ring: Position[] = polygon.map(([lat, lon]) => [lon, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first !== undefined && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

/**
 * The mask's GeoJSON: a world rectangle (counter-clockwise) with the polygon cut out as a clockwise hole, plus the
 * polygon's closed outline as a LineString. The fill layer takes the `mask` feature, the line layer the `outline`
 * feature (filter by `kind` or by geometry type), so the world rectangle's edge is never stroked.
 */
export function maskGeometry(polygon: Polygon): MaskGeometry {
  const outline = ringOf(polygon);
  const hole = signedArea(outline) > 0 ? [...outline].reverse() : [...outline];
  const world = WORLD_RING.map(([lon, lat]): Position => [lon, lat]);
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "mask" }, geometry: { type: "Polygon", coordinates: [world, hole] } },
      { type: "Feature", properties: { kind: "outline" }, geometry: { type: "LineString", coordinates: outline } },
    ],
  };
}
