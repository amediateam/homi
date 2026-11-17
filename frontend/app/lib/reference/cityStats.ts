import type { CityStats } from "./types";

/**
 * An element of `GET /cities` that the readers can hold: an object with a string `code`. `useCityStats` and
 * `useCitiesStats` read `code` of every element during render, so one `null` or codeless element would crash every
 * screen that shows a city (WP-25 security review, S-2). A plain module, so the server loader and the browser refresh
 * share it.
 */
export function isCityStats(value: unknown): value is CityStats {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { code?: unknown }).code === "string";
}

/** The usable elements of a `GET /cities` answer; `null` when the answer is not a list at all. */
export function cityStatsOf(data: unknown): CityStats[] | null {
  return Array.isArray(data) ? data.filter(isCityStats) : null;
}
