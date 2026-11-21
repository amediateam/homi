"use server";

import type { BlockedAuthorResult } from "@/features/listing/listingData";

import type { ListingInput } from "./listing";
import { runAction, type ActionAuth, type ActionResult } from "./run";
import { listingNumber } from "./validate";

/** The checked listing number; `null` unless the input is an object with a positive integer `number`. */
function numberOf(input: unknown): number | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  return listingNumber((input as Record<string, unknown>).number);
}

/**
 * `PUT /hidden/listings/{number}` (WP-26, the actions sheet): the listing leaves the user's feeds. Idempotent; the
 * answer is a 204, so the data is `null`. An input that fails its check makes no request.
 */
export async function hideListing(input: ListingInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  const number = numberOf(input);
  if (number === null) {
    return runAction.invalid("PUT", "hidden/listings/:number");
  }
  return runAction(auth, locale, (api) => api.hideListing(number));
}

/** `DELETE /hidden/listings/{number}`: «Вернуть» of the hide toast. */
export async function unhideListing(input: ListingInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  const number = numberOf(input);
  if (number === null) {
    return runAction.invalid("DELETE", "hidden/listings/:number");
  }
  return runAction(auth, locale, (api) => api.unhideListing(number));
}

/** `PUT /listings/{number}/blocked-author`: the author of the listing and the listing numbers that left the feeds. */
export async function blockAuthor(input: ListingInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<BlockedAuthorResult>> {
  const number = numberOf(input);
  if (number === null) {
    return runAction.invalid("PUT", "listings/:number/blocked-author");
  }
  return runAction(auth, locale, (api) => api.blockAuthor(number));
}

/** `DELETE /listings/{number}/blocked-author`: «Вернуть» of the block toast. */
export async function unblockAuthor(input: ListingInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  const number = numberOf(input);
  if (number === null) {
    return runAction.invalid("DELETE", "listings/:number/blocked-author");
  }
  return runAction(auth, locale, (api) => api.unblockAuthor(number));
}

/** A blocked author's entry id of `GET /hidden`: a ULID, as the API names it. */
const AUTHOR_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/**
 * `DELETE /hidden/authors/{id}` (WP-31, «Вернуть» on «Скрытое»): the author by the entry id of the hidden list. Not
 * `unblockAuthor`, which names the author by one of their listings (`DELETE /listings/{number}/blocked-author`).
 */
export async function unblockAuthorById(input: { id: string }, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  const id = typeof input === "object" && input !== null ? (input as { id?: unknown }).id : undefined;
  if (typeof id !== "string" || !AUTHOR_ID.test(id)) {
    return runAction.invalid("DELETE", "hidden/authors/:id");
  }
  return runAction(auth, locale, (api) => api.unblockAuthorById(id));
}

/** `DELETE /hidden` (WP-31, «Показать всё снова»): every hidden listing and every blocked author return. */
export async function unhideAll(_input: null, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  return runAction(auth, locale, (api) => api.unhideAll());
}
