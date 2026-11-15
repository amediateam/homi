import type { Polygon, PolygonVertex } from "./types";

/** The bounds of a drawn area, as the server checks them (`config/filters.php`, `03` §3.4 «Lasso»). */
export const POLYGON_MIN_VERTICES = 3;
export const POLYGON_MAX_VERTICES = 40;
export const POLYGON_DECIMALS = 5;

const SCALE = 10 ** POLYGON_DECIMALS;
const COORDINATE = /^-?\d{1,3}(\.\d{1,12})?$/;

const round = (value: number) => Math.round(value * SCALE) / SCALE;

function coordinate(value: unknown): number | null {
  const text = typeof value === "string" ? value.trim() : null;
  const number = typeof value === "number" ? value : text !== null && COORDINATE.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) ? round(number) : null;
}

function vertex(value: unknown): PolygonVertex | null {
  const parts = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(parts) || parts.length !== 2) {
    return null;
  }
  const lat = coordinate(parts[0]);
  const lon = coordinate(parts[1]);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  return [lat, lon];
}

/**
 * A polygon from the wire form (`lat,lon;lat,lon;…`) or from vertex pairs (`[[lat, lon], …]` of a radar), rounded to
 * 5 decimals and opened when the last vertex repeats the first. Anything malformed, or outside 3 … 40 vertices, is
 * `null`: the server would answer `422` for it.
 */
export function normalizePolygon(value: unknown): Polygon | null {
  const items = typeof value === "string" ? (value.trim() === "" ? [] : value.split(";")) : value;
  if (!Array.isArray(items)) {
    return null;
  }
  const vertices: PolygonVertex[] = [];
  for (const item of items) {
    const point = vertex(item);
    if (point === null) {
      return null;
    }
    vertices.push(point);
  }
  const last = vertices.at(-1);
  if (vertices.length > 1 && last && last[0] === vertices[0][0] && last[1] === vertices[0][1]) {
    vertices.pop();
  }
  if (vertices.length < POLYGON_MIN_VERTICES || vertices.length > POLYGON_MAX_VERTICES) {
    return null;
  }
  return vertices;
}

/** The wire form of the address and the API: `lat,lon;lat,lon;…`, every coordinate with 5 decimals. */
export function serializePolygon(polygon: Polygon): string {
  const fixed = (value: number) => round(value).toFixed(POLYGON_DECIMALS);
  return polygon.map(([lat, lon]) => `${fixed(lat)},${fixed(lon)}`).join(";");
}

/** The wire form back to vertices, or `null` (see `normalizePolygon`). */
export function parsePolygon(text: string): Polygon | null {
  return normalizePolygon(text);
}
