import { DEFAULT_CITY, DEFAULT_DEAL, TYPES_BY_DEAL } from "./defaults";
import { normalizePolygon } from "./polygon";
import {
  DEALS,
  MARKET_OPTIONS,
  OWNER_OPTIONS,
  POSTED_DAYS_OPTIONS,
  type PostedDays,
  type SearchFilters,
  TENANT_OPTIONS,
  ZONE_OPTIONS,
} from "./types";

/** The bounds the server enforces (`backend/config/filters.php`); a value outside them is dropped, not sent. */
export const FILTER_LIMITS = Object.freeze({
  rooms: [0, 10],
  price: [1, Number.MAX_SAFE_INTEGER],
  area: [1, 10000],
  listItems: 100,
  codeLength: 64,
} as const);

const CODE = new RegExp(`^[\\w.-]{1,${FILTER_LIMITS.codeLength}}$`);
const INTEGER = /^-?\d{1,16}$/;

export type NormalizeOptions = {
  /** The city when the input has none (BR-APP-001, BR-APP-010); `tashkent` when absent too. */
  readonly fallbackCity?: string | null;
};

type Raw = Readonly<Record<string, unknown>>;

/** Own properties only: nothing is read from a prototype. */
function own(raw: Raw, key: string): unknown {
  return Object.hasOwn(raw, key) ? raw[key] : undefined;
}

const integerOf = (value: unknown): number =>
  typeof value === "number" ? value : typeof value === "string" && INTEGER.test(value) ? Number(value) : NaN;

/** `value` if it is one of `options`; a numeric string counts for numeric options (`posted_days=7`). */
function oneOf<T extends string | number>(value: unknown, options: readonly T[]): T | null {
  const candidate = typeof options[0] === "number" ? integerOf(value) : value;
  return options.includes(candidate as T) ? (candidate as T) : null;
}

function code(value: unknown): string | null {
  return typeof value === "string" && CODE.test(value) ? value : null;
}

function codes(value: unknown): string[] {
  const items = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const kept: string[] = [];
  for (const item of items) {
    const valid = code(item);
    if (valid !== null && !kept.includes(valid) && kept.length < FILTER_LIMITS.listItems) {
      kept.push(valid);
    }
  }
  return kept;
}

function int(value: unknown, [lowest, highest]: readonly [number, number]): number | null {
  const number = integerOf(value);
  return Number.isSafeInteger(number) && number >= lowest && number <= highest ? number : null;
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function triState(value: unknown): boolean | null {
  if (flag(value)) {
    return true;
  }
  return value === false || value === 0 || value === "0" || value === "false" ? false : null;
}

/**
 * The one way to a valid `SearchFilters` (fix of LB-APP-007): every state change, address read and API body goes
 * through it, so no `undefined` reaches `filtersKey`.
 *
 * - Missing or invalid keys take the defaults of the input's deal; unknown keys are dropped; only own properties
 *   are read.
 * - Enums are closed; booleans are coerced (`true`, `1`, `'1'`, `'true'`); `furnished` stays three-state.
 * - Numbers are integers within the server's bounds, else `null` (`0` as a price or an area is "not set").
 * - Lists are lists of codes without repeats; `types` keeps the types the deal offers in the deal's order (none →
 *   apartments, as the server does); `zones` keeps the canonical order.
 * - `pets_only` wins over `pets`; a polygon outside 3 … 40 vertices is dropped (`normalizePolygon`).
 * - Geography modes are not resolved here: a server radar with zones and a polygon is kept as it came; the editing
 *   functions (`setGeography`) keep the modes exclusive.
 */
export function normalizeFilters(input: unknown, options: NormalizeOptions = {}): SearchFilters {
  const raw: Raw = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Raw) : {};
  const deal = oneOf(own(raw, "deal"), DEALS) ?? DEFAULT_DEAL;
  const offered = TYPES_BY_DEAL[deal];
  const asked = codes(own(raw, "types"));
  const types = offered.filter((type) => asked.includes(type));
  const zones = codes(own(raw, "zones"));
  const pets_only = flag(own(raw, "pets_only"));

  return {
    city: code(own(raw, "city")) ?? code(options.fallbackCity) ?? DEFAULT_CITY,
    deal,
    owner: oneOf(own(raw, "owner"), OWNER_OPTIONS) ?? "any",
    types: types.length > 0 ? types : ["apartment"],
    districts: codes(own(raw, "districts")),
    renovation: codes(own(raw, "renovation")),
    appliances: codes(own(raw, "appliances")),
    rooms_min: int(own(raw, "rooms_min"), FILTER_LIMITS.rooms),
    rooms_max: int(own(raw, "rooms_max"), FILTER_LIMITS.rooms),
    price_min: int(own(raw, "price_min"), FILTER_LIMITS.price),
    price_max: int(own(raw, "price_max"), FILTER_LIMITS.price),
    area_min: int(own(raw, "area_min"), FILTER_LIMITS.area),
    area_max: int(own(raw, "area_max"), FILTER_LIMITS.area),
    posted_days: oneOf<PostedDays>(own(raw, "posted_days"), POSTED_DAYS_OPTIONS),
    furnished: triState(own(raw, "furnished")),
    floor_not_first: flag(own(raw, "floor_not_first")),
    floor_not_last: flag(own(raw, "floor_not_last")),
    market: oneOf(own(raw, "market"), MARKET_OPTIONS),
    zones: ZONE_OPTIONS.filter((zone) => zones.includes(zone)),
    near_metro: flag(own(raw, "near_metro")),
    below_median: flag(own(raw, "below_median")),
    tenant: oneOf(own(raw, "tenant"), TENANT_OPTIONS),
    pets: flag(own(raw, "pets")) && !pets_only,
    pets_only,
    polygon: normalizePolygon(own(raw, "polygon") ?? null),
  };
}
