import type { CityRef } from "@homi/search";

/** A point on the ground in degrees, such as the position of `tg.location.get()`. */
export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** What the rule reads of a city of the reference data (`CityResource`). */
export type CityPlace = Pick<CityRef, "code" | "center" | "is_region">;

/** Within this distance the user is in the town itself. */
export const NEAR_TOWN_KM = 16;
/** Beyond this distance no town or region is offered. */
export const MAX_DISTANCE_KM = 110;

const EARTH_DIAMETER_KM = 12_742;
const RADIANS = Math.PI / 180;

/** The great-circle distance in kilometres (haversine, mean Earth radius 6 371 km). */
export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = (to.lat - from.lat) * RADIANS;
  const dLon = (to.lon - from.lon) * RADIANS;
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * RADIANS) * Math.cos(to.lat * RADIANS) * Math.sin(dLon / 2) ** 2;
  return EARTH_DIAMETER_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function hasCentre<T extends CityPlace>(city: T): city is T & { center: GeoPoint } {
  const center = city.center;
  return center !== null && center !== undefined && Number.isFinite(center.lat) && Number.isFinite(center.lon);
}

/** The closest city of `candidates` within `maxKm`; on a tie the earlier one in the server's order. */
function closest<T extends CityPlace & { center: GeoPoint }>(point: GeoPoint, candidates: readonly T[], maxKm: number): T | null {
  let best: T | null = null;
  let bestKm = Infinity;
  for (const city of candidates) {
    const km = distanceKm(point, city.center);
    if (km <= maxKm && km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

/**
 * The city to pick for a position (BR-APP-056): a town within 16 km; else a region within 110 km; else a town within
 * 110 km; else `null` («Рядом с вами наших городов пока нет»). A region is what the contract marks as one
 * (`is_region`, not the legacy `zoom < 11` guess, Q-APP-004); a city without the mark is a town, a city without a
 * usable centre is never offered. Pure: the position stays on the device, in no request, event or store.
 */
export function nearestCity<T extends CityPlace>(point: GeoPoint, cities: readonly T[]): T | null {
  const placed = cities.filter(hasCentre);
  const towns = placed.filter((city) => city.is_region !== true);
  const regions = placed.filter((city) => city.is_region === true);
  return closest(point, towns, NEAR_TOWN_KM) ?? closest(point, regions, MAX_DISTANCE_KM) ?? closest(point, towns, MAX_DISTANCE_KM);
}
