"use server";

import type { ContactData, PreparedShare, TranslationData } from "@/features/listing/listingData";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { listingNumber } from "./validate";

/** The one input of the listing screen's actions: the listing on screen. */
export interface ListingInput {
  number: number;
}

/** The checked listing number; `null` unless the input is an object with a positive integer `number`. */
function numberOf(input: unknown): number | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  return listingNumber((input as Record<string, unknown>).number);
}

/**
 * `POST /listings/{number}/contact` (WP-26, DEC-52): the number, its display form and the call link with its
 * expiry. Asked only from a tap; the answer is never cached. An input that fails its check makes no request.
 */
export async function getContact(input: ListingInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<ContactData>> {
  const number = numberOf(input);
  if (number === null) {
    return runAction.invalid("POST", "listings/:number/contact");
  }
  return runAction(auth, locale, (api) => api.contact(number));
}

/** `POST /listings/{number}/translation`: the original text in the locale of the request. */
export async function translate(input: ListingInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<TranslationData>> {
  const number = numberOf(input);
  if (number === null) {
    return runAction.invalid("POST", "listings/:number/translation");
  }
  return runAction(auth, locale, (api) => api.translation(number));
}

/** `POST /listings/{number}/share`: the prepared message `shareMessage` sends (TMA-030). */
export async function prepareShare(input: ListingInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<PreparedShare>> {
  const number = numberOf(input);
  if (number === null) {
    return runAction.invalid("POST", "listings/:number/share");
  }
  return runAction(auth, locale, (api) => api.share(number));
}
