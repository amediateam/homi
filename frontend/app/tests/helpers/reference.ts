import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import type { City, CityStats, Reference } from "@/lib/reference/types";
import { setReference } from "@/lib/reference/useReference";

/** A city of the reference data with `overrides` on top: Tashkent with medians and zones by default. */
export function cityOf(overrides: Partial<City> = {}): City {
  return {
    code: "tashkent",
    name: "Ташкент",
    center: { lat: 41.3111, lon: 69.2797 },
    zoom: 12,
    is_region: false,
    has_metro: true,
    has_median: true,
    districts: [{ code: "yunusabad", name: "Юнусабад" }],
    zones: [{ code: "center", name: "Центр" }],
    ...overrides,
  };
}

/**
 * Feeds the client store of `useReference()` as `ReferenceProvider` does (WP-22). `reference: null` leaves the
 * reference data missing; `stats: null` leaves `GET /cities` not loaded. `resetReference()` forgets both.
 */
export function feedReference({
  cities = [cityOf()],
  stats = null,
  reference = {},
}: {
  cities?: City[];
  stats?: CityStats[] | null;
  reference?: Partial<Reference> | null;
}): void {
  setReference({
    reference: reference === null ? { loaded: false, data: EMPTY_REFERENCE } : { loaded: true, data: { ...EMPTY_REFERENCE, cities, ...reference } },
    cities: stats === null ? { loaded: false, data: [] } : { loaded: true, data: stats },
  });
}
