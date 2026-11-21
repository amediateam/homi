/**
 * Total readers of the owner listing of WP-80 (`GET /owner/listings/{id}` and every write that answers it; WP-81, fix
 * of LB-APP-064): a value the client does not know reads as neutral — an unknown status as `unknown`, an unknown
 * reason or error as `null` (a rejected listing's unknown reason as `denied`, `03` SCR-054), a field of the wrong
 * type as `null` — and nothing here throws. Server-safe: no React, no browser API.
 */

export const OWNER_STATUSES = ["draft", "active", "paused", "rented", "removed", "rejected"] as const;
export type OwnerStatus = (typeof OWNER_STATUSES)[number] | "unknown";
export type ContactMode = "phone" | "request" | "hidden";
export type PhoneError = "not_uz" | "not_own";
export type RejectReason = "denied" | "limit";
export type Tenant = "family" | "students" | "girls" | "boys" | "foreigners";
export type Renovation = "euro" | "cosmetic" | "none";

export interface OwnerForm {
  city: string | null;
  district_code: string | null;
  landmark: string | null;
  lat: number | null;
  lon: number | null;
  room: boolean;
  rooms: number | null;
  area_m2: number | null;
  floor: number | null;
  floors_total: number | null;
  price: number | null;
  currency: "USD" | "UZS";
  renovation: Renovation | null;
  furniture: boolean | null;
  tenants: Tenant[];
  pets: boolean | null;
  description: string | null;
}

export interface OwnerPhoto {
  id: string;
  url: string;
}

export interface ShownPoint {
  lat: number;
  lon: number;
  radius_m: number;
}

/** The counters of a published listing (WP-80 `OwnerListingStatsResource`); `daily` is seven values, the last today. */
export interface OwnerStats {
  pending: number;
  requests: number;
  given: number;
  sent: number;
  opened: number;
  favorites: number;
  daysListed: number | null;
  daily: number[];
  /** The market delta in per cent where the server has a harvested median (DEC-78), else `null`. */
  priceDelta: number | null;
  priceTone: string | null;
}

export interface OwnerListingView {
  id: string;
  /** The public number once published, else `null`. */
  number: number | null;
  status: OwnerStatus;
  held: boolean;
  withdrawn: boolean;
  holdReason: string | null;
  publishedAt: string | null;
  photos: OwnerPhoto[];
  form: OwnerForm;
  contactMode: ContactMode | null;
  phoneSet: boolean;
  /** The owner's own number (DEC-72): shown masked by replay (`.ph-mask`), never sent to analytics. */
  phoneDisplay: string | null;
  phoneError: PhoneError | null;
  rejectReason: RejectReason | null;
  shownPoint: ShownPoint | null;
  /** Held, withdrawn, let or removed: the owner can no longer change it (WP-80's `locked()`). */
  locked: boolean;
  /** The counters (WP-82), `null` for a draft or when the server sent none. */
  stats: OwnerStats | null;
}

const TENANTS: readonly Tenant[] = ["family", "students", "girls", "boys", "foreigners"];
const RENOVATIONS: readonly Renovation[] = ["euro", "cosmetic", "none"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;

export function normalizeForm(value: unknown): OwnerForm {
  const form = isRecord(value) ? value : {};
  const tenants = Array.isArray(form.tenants) ? form.tenants.filter((item): item is Tenant => pick(item, TENANTS) !== null) : [];
  return {
    city: str(form.city),
    district_code: str(form.district_code),
    landmark: str(form.landmark),
    lat: num(form.lat),
    lon: num(form.lon),
    room: form.room === true,
    rooms: num(form.rooms),
    area_m2: num(form.area_m2),
    floor: num(form.floor),
    floors_total: num(form.floors_total),
    price: num(form.price),
    currency: form.currency === "UZS" ? "UZS" : "USD",
    renovation: pick(form.renovation, RENOVATIONS),
    furniture: bool(form.furniture),
    tenants: [...new Set(tenants)],
    pets: bool(form.pets),
    description: str(form.description),
  };
}

function photosOf(value: unknown): OwnerPhoto[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (isRecord(item) && str(item.id) !== null && str(item.url) !== null ? [{ id: item.id as string, url: item.url as string }] : []));
}

function shownPointOf(value: unknown): ShownPoint | null {
  if (!isRecord(value)) {
    return null;
  }
  const lat = num(value.lat);
  const lon = num(value.lon);
  const radius = num(value.radius_m);
  return lat === null || lon === null || radius === null ? null : { lat, lon, radius_m: radius };
}

/** The owner listing as the form reads it, or `null` when `value` has no id (nothing to show). */
export function normalizeOwnerListing(value: unknown): OwnerListingView | null {
  if (!isRecord(value) || str(value.id) === null) {
    return null;
  }
  const status = pick(value.status, OWNER_STATUSES) ?? "unknown";
  const held = value.held === true;
  const withdrawn = value.withdrawn === true;
  const reason = pick(value.reject_reason, ["denied", "limit"] as const);
  const number = num(value.number);
  return {
    id: value.id as string,
    number: number !== null && Number.isSafeInteger(number) && number > 0 ? number : null,
    status,
    held,
    withdrawn,
    holdReason: str(value.hold_reason),
    publishedAt: str(value.published_at),
    photos: photosOf(value.photos),
    form: normalizeForm(value.form),
    contactMode: pick(value.contact_mode, ["phone", "request", "hidden"] as const),
    phoneSet: value.phone_set === true,
    phoneDisplay: str(value.phone_display),
    phoneError: pick(value.phone_error, ["not_uz", "not_own"] as const),
    rejectReason: status === "rejected" ? (reason ?? "denied") : reason,
    shownPoint: shownPointOf(value.shown_point),
    locked: held || withdrawn || status === "rented" || status === "removed",
    stats: statsOf(value.stats),
  };
}

const count = (value: unknown): number => {
  const n = num(value);
  return n !== null && n > 0 ? Math.floor(n) : 0;
};

function statsOf(value: unknown): OwnerStats | null {
  if (!isRecord(value)) {
    return null;
  }
  const daily = Array.isArray(value.daily) ? value.daily.slice(-7).map(count) : [];
  return {
    pending: count(value.pending),
    requests: count(value.requests),
    given: count(value.given),
    sent: count(value.sent),
    opened: count(value.opened),
    favorites: count(value.favorites),
    daysListed: num(value.days_listed),
    // Always seven, the last today: a shorter answer is padded with zeros on the left.
    daily: [...Array<number>(Math.max(0, 7 - daily.length)).fill(0), ...daily],
    priceDelta: num(value.price_delta),
    priceTone: str(value.price_tone),
  };
}
