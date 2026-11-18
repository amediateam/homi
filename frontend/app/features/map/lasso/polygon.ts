import { type Polygon, POLYGON_DECIMALS, POLYGON_MAX_VERTICES, POLYGON_MIN_VERTICES, type PolygonVertex } from "@homi/search";

/**
 * The lasso's geometry (WP-28 "Lasso", BR-APP-061, `03` §3.4 «Lasso»): a finger stroke in screen pixels becomes the
 * search polygon of the filters, `[lat, lon]` vertices that `serializePolygon` of `@homi/search` writes as
 * `lat,lon;…`. Pure and without a map: the caller passes the engine's `unproject`. The mask stays in `mask.ts`.
 */

/** A point of the stroke, in the map container's pixels. */
export type ScreenPoint = { readonly x: number; readonly y: number };

/** The overlay skips a point closer than this to the previous one (`LassoOverlay`). */
export const LASSO_POINT_SPACING_PX = 4;

/** A stroke needs this many points, and this extent on each axis; anything less is too small. */
export const LASSO_MIN_POINTS = 3;
export const LASSO_MIN_SPAN_PX = 40;

/** Douglas–Peucker starts at this tolerance and grows it by this factor until at most 40 vertices are left. */
export const LASSO_TOLERANCE_PX = 3;
export const LASSO_TOLERANCE_GROWTH = 1.5;

/** The last vertex is dropped when it is this close to the first (the stroke ended where it began). */
export const LASSO_CLOSE_GAP_PX = 12;

/** After the last two-finger move of a gesture, the markers re-sync this much later (the engine hosts). */
export const LASSO_RESYNC_MS = 150;

const SCALE = 10 ** POLYGON_DECIMALS;

const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentDistance(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) {
    return distance(point, a);
  }
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Douglas–Peucker on the open stroke: its ends stay, a point farther than `tolerance` from its chord stays. */
function simplify(points: readonly ScreenPoint[], tolerance: number): ScreenPoint[] {
  const last = points.length - 1;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[last] = 1;
  const pending: [number, number][] = [[0, last]];
  for (let span = pending.pop(); span !== undefined; span = pending.pop()) {
    const [first, end] = span;
    let farthest = -1;
    let most = tolerance;
    for (let index = first + 1; index < end; index += 1) {
      const gap = segmentDistance(points[index], points[first], points[end]);
      if (gap > most) {
        most = gap;
        farthest = index;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      pending.push([first, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

const cross = (o: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function within(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): boolean {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}

/** The segments `ab` and `cd` cross or touch. */
function intersects(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (d1 * d2 < 0 && d3 * d4 < 0) {
    return true;
  }
  return (
    (d1 === 0 && within(a, c, d)) ||
    (d2 === 0 && within(b, c, d)) ||
    (d3 === 0 && within(c, a, b)) ||
    (d4 === 0 && within(d, a, b))
  );
}

/** Any two edges of the closed outline that do not share a vertex meet. */
function selfIntersects(outline: readonly ScreenPoint[]): boolean {
  const count = outline.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) {
        continue;
      }
      if (intersects(outline[i], outline[(i + 1) % count], outline[j], outline[(j + 1) % count])) {
        return true;
      }
    }
  }
  return false;
}

/** The convex hull (Andrew's monotone chain), counter-clockwise on screen, without collinear points. */
function convexHull(points: readonly ScreenPoint[]): ScreenPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) {
    return sorted;
  }
  const chain = (from: readonly ScreenPoint[]) => {
    const out: ScreenPoint[] = [];
    for (const point of from) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) {
        out.pop();
      }
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}

const round = (value: number) => Math.round(value * SCALE) / SCALE;

/**
 * The search polygon of a stroke, or `null` when it is too small to search in (the top bar then shows «Обведите
 * покрупнее»). Rejected: fewer than 3 points, or less than 40 px on either axis. The stroke is simplified with
 * Douglas–Peucker from a 3 px tolerance, × 1.5 per pass, until at most 40 vertices are left; the last vertex is
 * dropped when it lies within 12 px of the first and more than 3 remain; an outline that crosses itself is replaced
 * by its convex hull. Each vertex is unprojected and rounded to 5 decimals; repeats that rounding made are dropped.
 * The result is not closed and has 3 … 40 vertices — what `normalizePolygon` and the server accept — else `null`.
 */
export function lassoToPolygon(
  points: readonly ScreenPoint[],
  unproject: (x: number, y: number) => readonly [lat: number, lon: number],
): Polygon | null {
  if (points.length < LASSO_MIN_POINTS) {
    return null;
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  if (Math.max(...xs) - Math.min(...xs) < LASSO_MIN_SPAN_PX || Math.max(...ys) - Math.min(...ys) < LASSO_MIN_SPAN_PX) {
    return null;
  }

  let tolerance = LASSO_TOLERANCE_PX;
  let outline = simplify(points, tolerance);
  while (outline.length > POLYGON_MAX_VERTICES) {
    tolerance *= LASSO_TOLERANCE_GROWTH;
    outline = simplify(points, tolerance);
  }
  if (outline.length > POLYGON_MIN_VERTICES && distance(outline[outline.length - 1], outline[0]) <= LASSO_CLOSE_GAP_PX) {
    outline.pop();
  }
  if (selfIntersects(outline)) {
    outline = convexHull(outline);
  }

  const vertices: PolygonVertex[] = [];
  for (const { x, y } of outline) {
    const [lat, lon] = unproject(x, y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    const vertex: PolygonVertex = [round(lat), round(lon)];
    const previous = vertices[vertices.length - 1];
    if (previous === undefined || previous[0] !== vertex[0] || previous[1] !== vertex[1]) {
      vertices.push(vertex);
    }
  }
  const [first] = vertices;
  const closing = vertices[vertices.length - 1];
  if (vertices.length > 1 && first[0] === closing[0] && first[1] === closing[1]) {
    vertices.pop();
  }
  return vertices.length >= POLYGON_MIN_VERTICES && vertices.length <= POLYGON_MAX_VERTICES ? vertices : null;
}
