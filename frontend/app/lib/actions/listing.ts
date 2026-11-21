"use server";

import type { components } from "@homi/types";

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

export type ContactRequestWho = components["schemas"]["RequestWho"];
export type ContactRequestResult = components["schemas"]["ContactRequestResultResource"];

const WHO: readonly ContactRequestWho[] = ["one", "couple", "family", "students", "friends"];
/** The bounds of the request sheet (SCR-061, WP-80's `StoreContactRequestRequest`); a "use server" file exports none. */
const REQUEST_PEOPLE_MAX = 20;
const REQUEST_MOVE_IN_MAX = 32;
const REQUEST_MESSAGE_MAX = 500;
/** Telegram's launch data stays far below this; anything longer is not launch data. */
const INIT_DATA_MAX = 8192;

export interface ContactRequestInput {
  number: number;
  who: ContactRequestWho;
  people: number;
  move_in: string | null;
  message: string | null;
  /** The current launch's `initData` (DEC-76): the server reads the first name from it; nothing keeps it. */
  init_data: string;
}

const textOrNull = (value: unknown, max: number): string | null | undefined => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return undefined;
  }
  return trimmed === "" ? null : trimmed;
};

/**
 * `POST /listings/{number}/contact-request` (WP-83, SCR-061, DEC-52, DEC-76): the request with who, how many, the
 * move-in and the message, and the launch data for the first name; the answer is the request's status, never a number.
 * An input that fails its check (a bad number, a `who` outside the five, `people` outside 1 … 20, a move-in above 32
 * or a message above 500 characters, no launch data) makes no request. The input is never logged: a failure carries
 * only its code (`16` SEC-REQ-007).
 */
export async function sendContactRequest(input: ContactRequestInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<ContactRequestResult>> {
  const record = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as unknown as Record<string, unknown>) : {};
  const number = numberOf(input);
  const who = typeof record.who === "string" && (WHO as readonly string[]).includes(record.who) ? (record.who as ContactRequestWho) : null;
  const people = typeof record.people === "number" && Number.isInteger(record.people) && record.people >= 1 && record.people <= REQUEST_PEOPLE_MAX ? record.people : null;
  const moveIn = textOrNull(record.move_in, REQUEST_MOVE_IN_MAX);
  const message = textOrNull(record.message, REQUEST_MESSAGE_MAX);
  const initData = typeof record.init_data === "string" && record.init_data !== "" && record.init_data.length <= INIT_DATA_MAX ? record.init_data : null;
  if (number === null || who === null || people === null || moveIn === undefined || message === undefined || initData === null) {
    return runAction.invalid("POST", "listings/:number/contact-request");
  }
  return runAction(auth, locale, (api) => api.contactRequest(number, { who, people, move_in: moveIn, message, init_data: initData }));
}
