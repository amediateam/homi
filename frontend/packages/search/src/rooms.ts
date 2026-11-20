import { normalizeFilters } from "./normalize";
import type { SearchFilters } from "./types";

/** The room buttons; `4` means "4 or more" (`rooms_max = null`). */
export const ROOM_OPTIONS = [1, 2, 3, 4] as const;

const OPEN_FROM = 4;

/**
 * A tap on a room button (BR-APP-007): one value is picked; a different value tapped while one value (or 4+) is
 * picked makes the range between them; `4` is "4 or more"; `null` («Любые») clears.
 */
export function pickRooms(filters: SearchFilters, rooms: number | null): SearchFilters {
  if (rooms === null) {
    return normalizeFilters({ ...filters, rooms_min: null, rooms_max: null });
  }
  const { rooms_min: min, rooms_max: max } = filters;
  const onePicked = max === min || (max === null && min === OPEN_FROM);
  if (min !== null && onePicked && min !== rooms) {
    const low = Math.min(min, rooms);
    const high = Math.max(min, rooms);
    return normalizeFilters({ ...filters, rooms_min: low, rooms_max: high >= OPEN_FROM ? null : high });
  }
  return normalizeFilters({ ...filters, rooms_min: rooms, rooms_max: rooms >= OPEN_FROM ? null : rooms });
}

/**
 * The room button `rooms` lies inside the picked range. Only an upper bound («до N», a radar's or a flow option's
 * filters) counts from 1 (BR-APP-007, legacy since `index-CIa0Ldj2.js`).
 */
export function isRoomPicked(filters: Pick<SearchFilters, "rooms_min" | "rooms_max">, rooms: number): boolean {
  const min = filters.rooms_min ?? (filters.rooms_max !== null ? 1 : null);
  if (min === null) {
    return false;
  }
  return rooms >= min && rooms <= (filters.rooms_max ?? Number.POSITIVE_INFINITY);
}
