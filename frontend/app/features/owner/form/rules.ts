import type { OwnerForm, OwnerPhoto } from "../normalize";

/**
 * The pure rules of the owner questionnaire (WP-81, SCR-052; BR-APP-080 couplings, BR-APP-081 the «Дальше» gate, the
 * floor rule, the inside-the-box pre-check of the place). No React, no browser API.
 */

/** The longest text of a number field: six characters, seven for the floor (`03` BR-APP-080). */
export const NUMBER_FIELD_MAX = 6;
export const FLOOR_FIELD_MAX = 7;
/** The price field: digits only, at most 12 (`PriceInput`). */
export const PRICE_DIGITS_MAX = 12;
export const LANDMARK_MAX = 120;
export const DESCRIPTION_MAX = 600;

/** The rectangle of Uzbekistan the client checks a point against before any request (lat 37–46, lon 55–74). */
export function inUzbekistanBox(lat: number, lon: number): boolean {
  return lat >= 37 && lat <= 46 && lon >= 55 && lon <= 74;
}

/** The bounds of the server's checks (WP-80 `UpdateOwnerListingRequest`): a value outside them is never sent. */
export const AREA_MIN = 5;
export const AREA_MAX = 1000;
export const FLOOR_MIN = -3;
export const FLOOR_MAX = 99;
export const FLOORS_MAX = 99;

/** «Площадь» as typed: a decimal with a point or a comma, 5 … 1000, one decimal kept; anything else is `null`. */
export function parseArea(text: string): number | null {
  const value = text.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }
  const area = Math.round(Number(value) * 10) / 10;
  return area >= AREA_MIN && area <= AREA_MAX ? area : null;
}

/**
 * «Этаж» as typed: a whole number, or «a/b», which also gives the number of floors (`03` SCR-052); a floor may be
 * zero or below (a ground floor, a basement), the floors are above 0. Anything else is `null`.
 */
/**
 * A whole number typed outside the server's bounds («3», «1500» m², floor «120»): the field is marked invalid, since
 * the value is not sent and the saved one stays. A half-typed number («45,») is not.
 */
export function areaOutOfRange(text: string): boolean {
  return /^\s*\d+(?:[.,]\d+)?\s*$/.test(text) && parseArea(text) === null;
}

export function floorOutOfRange(text: string): boolean {
  return /^\s*-?\d{1,3}\s*(?:\/\s*\d{1,3})?\s*$/.test(text) && parseFloor(text) === null;
}

export function parseFloor(text: string): { floor: number; floors: number | null } | null {
  const match = /^\s*(-?\d{1,3})\s*(?:\/\s*(\d{1,3}))?\s*$/.exec(text);
  if (match === null) {
    return null;
  }
  const floor = Number(match[1]);
  const floors = match[2] === undefined ? null : Number(match[2]);
  if (floor < FLOOR_MIN || floor > FLOOR_MAX || (floors !== null && (floors < 1 || floors > FLOORS_MAX))) {
    return null;
  }
  return { floor, floors };
}

/** The floor is above the floors of the building: both are held back from a save, and «Дальше» refuses. */
export function floorAboveFloors(form: Pick<OwnerForm, "floor" | "floors_total">): boolean {
  return form.floor !== null && form.floors_total !== null && form.floor > form.floors_total;
}

/** A change of one field and what it couples (BR-APP-080, DEV-058). */
export type FormChange = Partial<OwnerForm>;

/**
 * The fields a change of `key` also sets: a price sets its currency (the one shown), `room` and `rooms` exclude each
 * other, another city clears the district and the point (DEV-058; the caller offers «Вернуть»). Clearing the
 * landmark keeps the point.
 */
export function couple(form: OwnerForm, change: FormChange): FormChange {
  const out: FormChange = { ...change };
  if ("price" in change && change.price !== null && !("currency" in change)) {
    out.currency = form.currency;
  }
  if (change.room === true) {
    out.rooms = null;
  }
  if ("rooms" in change && change.rooms !== null) {
    out.room = false;
  }
  if ("city" in change && change.city !== form.city) {
    out.district_code = null;
    out.lat = null;
    out.lon = null;
  }
  return out;
}

/** The defaults a new draft takes: the profile's city when the draft has none. */
export function defaultsFor(form: OwnerForm, profileCity: string | null): FormChange {
  return form.city === null && profileCity !== null ? { city: profileCity } : {};
}

/** What «Дальше» needs (BR-APP-081), in the order of `own.need.*`. */
export type Need = "city" | "place" | "rooms" | "price" | "photos";

/**
 * The missing parts of the form, in their order: a city, a place (a district, a landmark or a point), rooms or
 * «Комната», a price (with its currency, always set) and at least one photo. The floor rule is separate
 * (`floorAboveFloors`).
 */
export function missingParts(form: OwnerForm, photos: readonly OwnerPhoto[]): Need[] {
  const needs: Need[] = [];
  if (form.city === null) {
    needs.push("city");
  }
  if (form.district_code === null && form.landmark === null && (form.lat === null || form.lon === null)) {
    needs.push("place");
  }
  if (!form.room && (form.rooms === null || form.rooms <= 0)) {
    needs.push("rooms");
  }
  if (form.price === null || form.price <= 0) {
    needs.push("price");
  }
  if (photos.length === 0) {
    needs.push("photos");
  }
  return needs;
}

/** The fields a need highlights (`data-focus` tokens of the sections). */
export const NEED_FIELDS: Record<Need, readonly string[]> = {
  city: ["city"],
  place: ["district_code", "landmark"],
  rooms: ["rooms"],
  price: ["price"],
  photos: ["photos"],
};

/** The fields a `422` key highlights: `floor` both floor fields, `point` both coordinates (the place). */
export function fieldsOfError(key: string): string[] {
  if (key === "floor" || key === "floors_total") {
    return ["floor", "floors_total"];
  }
  if (key === "point" || key === "lat" || key === "lon") {
    return ["lat", "lon"];
  }
  return [key];
}
