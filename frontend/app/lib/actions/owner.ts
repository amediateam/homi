"use server";

import type { components } from "@homi/types";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { oneOf, referenceCode, ulid } from "./validate";

type Schemas = components["schemas"];

/** `GET /owner/listings/{id}` and every owner write that answers the listing (WP-80). */
export type OwnerListingBody = Schemas["OwnerListingResource"];
/** The body of `PATCH /owner/listings/{id}`: any subset of the form's keys, `null` clears one. */
export type OwnerFields = Schemas["UpdateOwnerListingRequest"];
export type ContactMode = Schemas["UpdateContactModeRequest"]["mode"];

const CURRENCIES = ["USD", "UZS"] as const;
const RENOVATIONS = ["euro", "cosmetic", "none"] as const;
const TENANTS = ["family", "students", "girls", "boys", "foreigners"] as const;
const MODES: readonly ContactMode[] = ["request", "phone"];
/** The longest texts the server takes (WP-80): the landmark and the description. */
const LANDMARK_MAX = 120;
const DESCRIPTION_MAX = 600;
/** The most photos a listing holds (`limits.owner_photos` of the reference data is the same number). */
const PHOTOS_MAX = 10;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const text = (max: number) => (value: unknown): value is string => typeof value === "string" && value.length <= max;

/**
 * The check of each key of the form (SEC-REQ-017: nothing from the client is trusted): the type and a loose bound.
 * The server checks every value again with its own rules; an input that fails here makes no request.
 */
const FIELD_CHECKS: { [K in keyof OwnerFields]-?: (value: unknown) => boolean } = {
  city: (value) => referenceCode(value) !== null,
  district_code: (value) => referenceCode(value) !== null,
  landmark: text(LANDMARK_MAX),
  lat: (value) => finite(value) && value >= -90 && value <= 90,
  lon: (value) => finite(value) && value >= -180 && value <= 180,
  room: (value) => typeof value === "boolean",
  // The server's bounds (WP-80): a value the form would never send is refused here as well.
  rooms: (value) => integer(value) && value >= 1 && value <= 5,
  area_m2: (value) => finite(value) && value >= 5 && value <= 1000,
  floor: (value) => integer(value) && value >= -3 && value <= 99,
  floors_total: (value) => integer(value) && value >= 1 && value <= 99,
  price: (value) => integer(value) && value > 0,
  currency: (value) => oneOf(value, CURRENCIES) !== null,
  renovation: (value) => oneOf(value, RENOVATIONS) !== null,
  furniture: (value) => typeof value === "boolean",
  tenants: (value) =>
    Array.isArray(value) && value.length <= TENANTS.length && new Set(value).size === value.length && value.every((item) => oneOf(item, TENANTS) !== null),
  pets: (value) => typeof value === "boolean",
  description: text(DESCRIPTION_MAX),
};

/** The changed fields: at least one known key, each `null` or a value its check accepts; else `null`. */
function fieldsOf(value: unknown): OwnerFields | null {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    const check = (FIELD_CHECKS as Record<string, ((value: unknown) => boolean) | undefined>)[key];
    if (check === undefined || (item !== null && !check(item))) {
      return null;
    }
    out[key] = item;
  }
  return out as OwnerFields;
}

/**
 * `POST /owner/listings` (BR-APP-075, DEV-054): the caller's untouched draft when one exists, else a new one. The
 * answer is the listing; `409 owner_limit` carries `limit` and `max` in the failure's `detail`.
 */
export async function createOwnerListing(
  input: Record<string, never> = {},
  auth?: ActionAuth,
  locale?: string,
): Promise<ActionResult<OwnerListingBody>> {
  // The action takes no fields: anything sent is refused, as every other action refuses an input it does not know.
  if (!isRecord(input) || Object.keys(input).length > 0) {
    return runAction.invalid("POST", "owner/listings");
  }
  return runAction(auth, locale, (api) => api.createOwnerListing());
}

/** `PATCH /owner/listings/{id}` (BR-APP-079, the autosave): the changed fields only, `null` clears one. */
export async function updateOwnerListing(
  input: { id: string; fields: OwnerFields },
  auth?: ActionAuth,
  locale?: string,
): Promise<ActionResult<OwnerListingBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const id = ulid(raw.id);
  const fields = fieldsOf(raw.fields);
  if (id === null || fields === null) {
    return runAction.invalid("PATCH", "owner/listings/:id");
  }
  return runAction(auth, locale, (api) => api.updateOwnerListing(id, fields));
}

/** `DELETE /owner/listings/{id}/photos/{photo}` (BR-APP-082). */
export async function deleteOwnerPhoto(
  input: { id: string; photo: string },
  auth?: ActionAuth,
  locale?: string,
): Promise<ActionResult<OwnerListingBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const id = ulid(raw.id);
  const photo = ulid(raw.photo);
  if (id === null || photo === null) {
    return runAction.invalid("DELETE", "owner/listings/:id/photos/:photo");
  }
  return runAction(auth, locale, (api) => api.deleteOwnerPhoto(id, photo));
}

/** `PUT /owner/listings/{id}/photos/order`: the full order, the cover first; distinct ULIDs, at most ten. */
export async function orderOwnerPhotos(
  input: { id: string; ids: string[] },
  auth?: ActionAuth,
  locale?: string,
): Promise<ActionResult<OwnerListingBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const id = ulid(raw.id);
  const ids = Array.isArray(raw.ids) ? raw.ids.map(ulid) : null;
  if (id === null || ids === null || ids.length === 0 || ids.length > PHOTOS_MAX || ids.some((item) => item === null)) {
    return runAction.invalid("PUT", "owner/listings/:id/photos/order");
  }
  const order = ids as string[];
  if (new Set(order.map((item) => item.toUpperCase())).size !== order.length) {
    return runAction.invalid("PUT", "owner/listings/:id/photos/order");
  }
  return runAction(auth, locale, (api) => api.orderOwnerPhotos(id, { ids: order }));
}

/** `PUT /owner/listings/{id}/contact-mode` (BR-APP-086): `request` or `phone`. */
export async function setContactMode(
  input: { id: string; mode: ContactMode },
  auth?: ActionAuth,
  locale?: string,
): Promise<ActionResult<OwnerListingBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const id = ulid(raw.id);
  const mode = oneOf(raw.mode, MODES);
  if (id === null || mode === null) {
    return runAction.invalid("PUT", "owner/listings/:id/contact-mode");
  }
  return runAction(auth, locale, (api) => api.setContactMode(id, { mode }));
}

/** `POST /owner/listings/{id}/phone-request` (BR-APP-084): opens the ten-minute window of the bot. */
export async function requestOwnerPhone(input: { id: string }, auth?: ActionAuth, locale?: string): Promise<ActionResult<OwnerListingBody>> {
  const id = ulid(isRecord(input) ? input.id : undefined);
  if (id === null) {
    return runAction.invalid("POST", "owner/listings/:id/phone-request");
  }
  return runAction(auth, locale, (api) => api.requestOwnerPhone(id));
}

/**
 * `POST /owner/listings/{id}/publish` (BR-APP-087): the listing as published or held. A refusal carries its code
 * (`owner_phone_required`, `owner_rejected` with `detail.reason`, `owner_limit`, `owner_listing_locked`,
 * `validation_failed` with `detail.fields`).
 */
export async function publishOwnerListing(input: { id: string }, auth?: ActionAuth, locale?: string): Promise<ActionResult<OwnerListingBody>> {
  const id = ulid(isRecord(input) ? input.id : undefined);
  if (id === null) {
    return runAction.invalid("POST", "owner/listings/:id/publish");
  }
  return runAction(auth, locale, (api) => api.publishOwnerListing(id));
}

export type OwnerStatusChange = Schemas["UpdateOwnerStatusRequest"]["status"];
export type OwnerRequestAction = Schemas["OwnerRequestAction"];
export type OwnerRequestBody = Schemas["OwnerRequestResource"];

const STATUS_CHANGES: readonly OwnerStatusChange[] = ["active", "paused", "rented", "removed"];
const REQUEST_ACTIONS: readonly OwnerRequestAction[] = ["give", "decline", "reason_found", "reason_agent", "undo", "late"];

/**
 * `PUT /owner/listings/{id}/status` (WP-82, BR-APP-088): «Пауза», «Вернуть», «Сдано», «Снять». `active` is refused
 * with `403 owner_disabled` while the cabinet is off (DEC-81); the others always work.
 */
export async function setOwnerStatus(input: { id: string; status: OwnerStatusChange }, auth?: ActionAuth, locale?: string): Promise<ActionResult<OwnerListingBody>> {
  const id = ulid(isRecord(input) ? input.id : undefined);
  const status = oneOf(isRecord(input) ? input.status : undefined, STATUS_CHANGES);
  if (id === null || status === null) {
    return runAction.invalid("PUT", "owner/listings/:id/status");
  }
  return runAction(auth, locale, (api) => api.setOwnerStatus(id, { status }));
}

/** `DELETE /owner/listings/{id}` (WP-82): «Удалить» of a draft or a rejected listing. */
export async function deleteOwnerListing(input: { id: string }, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  const id = ulid(isRecord(input) ? input.id : undefined);
  if (id === null) {
    return runAction.invalid("DELETE", "owner/listings/:id");
  }
  return runAction(auth, locale, (api) => api.deleteOwnerListing(id));
}

/** `POST /owner/requests/{id}/answer` (WP-82, SCR-058): one answer to one request; the request as it is now. */
export async function answerRequest(input: { id: string; action: OwnerRequestAction }, auth?: ActionAuth, locale?: string): Promise<ActionResult<OwnerRequestBody>> {
  const id = ulid(isRecord(input) ? input.id : undefined);
  const action = oneOf(isRecord(input) ? input.action : undefined, REQUEST_ACTIONS);
  if (id === null || action === null) {
    return runAction.invalid("POST", "owner/requests/:id/answer");
  }
  return runAction(auth, locale, (api) => api.answerOwnerRequest(id, { action }));
}
