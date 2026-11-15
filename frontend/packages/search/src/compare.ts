import { baseDeal, defaultFilters } from "./defaults";
import { normalizeFilters } from "./normalize";
import type { PolygonVertex } from "./types";

function canonical(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return [...value].sort((a: unknown, b: unknown) => {
    if (typeof a === "string" && typeof b === "string") {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    const [aLat, aLon] = a as PolygonVertex;
    const [bLat, bLon] = b as PolygonVertex;
    return aLat - bLat || aLon - bLon;
  });
}

/**
 * The stable comparison key of a filter set (BR-APP-012): normalised (so missing keys take the defaults and nothing
 * is `undefined`, LB-APP-007), `posted_days` ignored, keys sorted, every list sorted (codes by code unit, polygon
 * vertices by latitude, then longitude — the order of the server's `canonicalHash`).
 */
export function filtersKey(filters: unknown): string {
  const normalized: Record<string, unknown> = { ...normalizeFilters(filters), posted_days: null };
  return JSON.stringify(
    Object.keys(normalized)
      .sort()
      .map((key) => [key, canonical(normalized[key])]),
  );
}

/** Two filter sets describe the same search (radar matching). */
export function sameFilters(a: unknown, b: unknown): boolean {
  return filtersKey(a) === filtersKey(b);
}

/** The filters differ from the defaults of their base deal and city (BR-APP-013; daily rent is custom). */
export function isCustomFilters(filters: unknown): boolean {
  const normalized = normalizeFilters(filters);
  return !sameFilters(normalized, defaultFilters(baseDeal(normalized.deal), normalized.city));
}

/** The badge of the filters button: the number of active groups (BR-APP-011). */
export function countActiveFilters(filters: unknown): number {
  const f = normalizeFilters(filters);
  const groups = [
    f.deal === "rent_daily",
    f.types.join() !== "apartment",
    f.rooms_min !== null || f.rooms_max !== null,
    f.price_min !== null || f.price_max !== null,
    f.districts.length > 0 || f.zones.length > 0 || (f.polygon?.length ?? 0) > 0,
    f.near_metro,
    f.below_median,
    f.owner !== "any",
    f.tenant !== null,
    (f.pets || f.pets_only) && f.deal !== "sale",
    f.furnished !== null,
    f.renovation.length > 0,
    f.floor_not_first || f.floor_not_last,
    f.area_min !== null || f.area_max !== null,
    f.market !== null,
    f.appliances.length > 0,
    f.posted_days !== null,
  ];
  return groups.filter(Boolean).length;
}
