import type { Bounds, Padding } from "@/features/map/camera";

/**
 * The geometry of the listing's spot map (WP-28 "Spot map", SCR-021): the circle of the approximate place, the
 * camera's box and the hand-offs to Yandex and Google Maps. Pure and engine-free: `spotGL.ts` and `spotLeaflet.ts`
 * draw from it, the fullscreen map measures with it. Coordinates are degrees, radii metres.
 */

/** The radius of the place when the listing has none, or zero or a negative one (`03` §3.4). */
export const DEFAULT_SPOT_RADIUS_M = 500;

/** The circle's fill, on both engines; the outline is the theme's (`palette.ts`). */
export const SPOT_FILL_OPACITY = 0.12;
export const SPOT_LINE_WIDTH = 2;

/** A fit to the spot (and the user) never zooms in further than this, on the Leaflet scale (`camera.ts`). */
export const SPOT_MAX_ZOOM = 17;

/** The mini map keeps the circle off its rounded edge. */
export const MINI_PADDING: Padding = { top: 16, bottom: 16, left: 16, right: 16 };

/** The fullscreen map keeps the circle and the user clear of the close button above and of the bottom card. */
export const FULLSCREEN_PADDING: Padding = { top: 90, bottom: 240, left: 32, right: 32 };

/** At most this share of the map's width, and of its height, is padding: the rest always holds the fit. */
const MAX_PADDING_SHARE = 0.5;

function shrink(before: number, after: number, room: number): [number, number] {
  const limit = room * MAX_PADDING_SHARE;
  const total = before + after;
  return total <= limit ? [before, after] : [(before * limit) / total, (after * limit) / total];
}

/**
 * The padding of a fit in a map of `size`: the fullscreen map's when it is interactive, else the mini map's, shrunk
 * in proportion on an axis where it would take more than half of the map (a short Telegram Desktop window, a
 * landscape phone), so a fit never runs out of room — Leaflet would compute no zoom and MapLibre refuse the fit.
 */
export function spotPadding(interactive: boolean, size: { width: number; height: number }): Padding {
  const padding = interactive ? FULLSCREEN_PADDING : MINI_PADDING;
  const [top, bottom] = shrink(padding.top, padding.bottom, size.height);
  const [left, right] = shrink(padding.left, padding.right, size.width);
  return { top, bottom, left, right };
}

export type GeoPoint = { lat: number; lon: number };

/** The listing's place: its coordinates and the radius drawn around them. */
export type Spot = GeoPoint & { radius: number };

const EARTH_RADIUS_M = 6_371_008.8;
const CIRCLE_STEPS = 64;
const COORD_DECIMALS = 6;

/** `geo_radius_m` of the listing as the radius drawn: the default when missing, zero, negative or not a number. */
export function spotRadius(geoRadiusM: number | null | undefined): number {
  return typeof geoRadiusM === "number" && Number.isFinite(geoRadiusM) && geoRadiusM > 0 ? geoRadiusM : DEFAULT_SPOT_RADIUS_M;
}

/** The spot of a listing's `location` and `geo_radius_m`; `null` without coordinates (no spot map, no hint). */
export function spotOf(location: GeoPoint | null | undefined, geoRadiusM: number | null | undefined): Spot | null {
  return location ? { lat: location.lat, lon: location.lon, radius: spotRadius(geoRadiusM) } : null;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Degrees of latitude and of longitude that `metres` span at the spot's latitude. */
function spanOf(lat: number, metres: number): { lat: number; lon: number } {
  const degrees = (metres / EARTH_RADIUS_M) * (180 / Math.PI);
  return { lat: degrees, lon: degrees / Math.cos(toRadians(lat)) };
}

/** The circle of the spot as a closed ring of `[lon, lat]`, counter-clockwise (RFC 7946), for a GeoJSON polygon. */
export function circleRing({ lat, lon, radius }: Spot, steps = CIRCLE_STEPS): [number, number][] {
  const span = spanOf(lat, radius);
  const ring: [number, number][] = [];
  for (let step = 0; step < steps; step += 1) {
    const angle = (2 * Math.PI * step) / steps;
    ring.push([lon + span.lon * Math.cos(angle), lat + span.lat * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  return ring;
}

/**
 * The box of the spot's circle, grown to hold the user's position when it is known: what the map fits on open and
 * after «Где я» (SCR-021 "Locate: fits both the spot and the user").
 */
export function spotBounds(spot: Spot, user: GeoPoint | null = null): Bounds {
  const span = spanOf(spot.lat, spot.radius);
  const box: Bounds = { south: spot.lat - span.lat, west: spot.lon - span.lon, north: spot.lat + span.lat, east: spot.lon + span.lon };
  if (user === null) {
    return box;
  }
  return {
    south: Math.min(box.south, user.lat),
    west: Math.min(box.west, user.lon),
    north: Math.max(box.north, user.lat),
    east: Math.max(box.east, user.lon),
  };
}

/** The great-circle distance between two points, in kilometres (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return (2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))) / 1000;
}

/** The zoom Yandex Maps opens at for the spot's radius: 17, 16, 15 up to 250, 600, 1 500 m, else 13 (legacy). */
export function yandexZoom(radius: number): number {
  if (radius <= 250) {
    return 17;
  }
  if (radius <= 600) {
    return 16;
  }
  if (radius <= 1500) {
    return 15;
  }
  return 13;
}

function coordinate(value: number): string {
  return value.toFixed(COORD_DECIMALS);
}

/**
 * «Яндекс Карты» (SCR-021): the spot centred with a red pin, at the zoom of its radius. Built from numbers only on a
 * fixed host (SEC-REQ-019).
 */
export function yandexUrl({ lat, lon, radius }: Spot): string {
  const point = `${coordinate(lon)},${coordinate(lat)}`;
  return `https://yandex.uz/maps/?ll=${point}&z=${yandexZoom(radius)}&pt=${point},pm2rdm`;
}

/** «Google Карты» (SCR-021): a search for the spot's coordinates. Numbers only, fixed host (SEC-REQ-019). */
export function googleUrl({ lat, lon }: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${coordinate(lat)},${coordinate(lon)}`;
}
