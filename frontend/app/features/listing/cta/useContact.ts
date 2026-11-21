"use client";

import { useRef, useState } from "react";

import { rereadListing } from "../contact/requestState";
import { getContact } from "@/lib/actions/listing";
import { useAction } from "@/lib/actions/useAction";
import { track } from "@/lib/analytics/events";
import { LINK_DEBOUNCE_MS, tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import type { ContactData, ListingDetails } from "../listingData";
import { openOriginal } from "../openOriginal";
import type { PhoneControl } from "../sections/controls";

/** Without a readable expiry a contact is stale this long after its receipt (legacy: a 10 min link renewed at 8). */
export const CONTACT_FRESH_MS = 8 * 60_000;
/** A contact is stale this long before the contract's `expires_at`. */
export const CONTACT_EXPIRY_MARGIN_MS = 2 * 60_000;

/** A contact answer as the screen keeps it, in memory only (DEC-52). */
export interface ContactInfo {
  /** The number in full international form; `null` when the source gives only a call link (Q-API-062). */
  phone: string | null;
  phoneDisplay: string | null;
  /** The call page (`call_url`). */
  url: string;
  receivedAt: number;
  /** `expires_at` in ms; `null` when it cannot be read. */
  expiresAt: number | null;
}

/** Stale from `expires_at` − 2 min; without a readable expiry, from 8 min after the receipt. */
export function isStale(contact: ContactInfo, now: number): boolean {
  return contact.expiresAt !== null
    ? now >= contact.expiresAt - CONTACT_EXPIRY_MARGIN_MS
    : now >= contact.receivedAt + CONTACT_FRESH_MS;
}

function contactInfo(data: ContactData, receivedAt: number): ContactInfo {
  const expiresAt = Date.parse(data.expires_at);
  return {
    phone: data.phone || null,
    phoneDisplay: data.phone_display || null,
    url: data.call_url,
    receivedAt,
    expiresAt: Number.isNaN(expiresAt) ? null : expiresAt,
  };
}

export interface UseContact {
  contact: ContactInfo | null;
  /** A fresh contact as it is; otherwise one `getContact`, shared by concurrent taps; the old contact when it fails. */
  reveal: () => Promise<ContactInfo | null>;
}

/** The contact of one listing, held by the instance that asked for it. */
interface Held {
  number: number;
  contact: ContactInfo;
}

/**
 * The author's contact (WP-26, DEC-52, BR-APP-033): `null` until the first successful `getContact`, which only a tap
 * asks for. Nothing is fetched on mount, on a timer or on a return to the app (TMA-040 is not built): a stale contact
 * is fetched again by the next tap.
 */
export function useContact(number: number, options?: { now?: () => number }): UseContact {
  const fetchContact = useAction(getContact);
  const now = options?.now ?? Date.now;
  const [held, setHeld] = useState<Held | null>(null);
  const latest = useRef<Held | null>(null);
  const inflight = useRef<{ number: number; promise: Promise<ContactInfo | null> } | null>(null);

  const reveal = (): Promise<ContactInfo | null> => {
    const old = latest.current?.number === number ? latest.current.contact : null;
    if (old !== null && !isStale(old, now())) {
      return Promise.resolve(old);
    }
    if (inflight.current?.number === number) {
      return inflight.current.promise;
    }
    const promise = fetchContact({ number })
      .then(
        (result) => {
          if (!result.ok) {
            // A `given` request whose number is no longer there (WP-83): the card is read again in the background.
            if (result.code === "contact_unavailable") {
              rereadListing(number);
            }
            return old;
          }
          const next = { number, contact: contactInfo(result.data, now()) };
          latest.current = next;
          setHeld(next);
          return next.contact;
        },
        () => old,
      )
      .finally(() => {
        if (inflight.current?.promise === promise) {
          inflight.current = null;
        }
      });
    inflight.current = { number, promise };
    return promise;
  };

  return { contact: held?.number === number ? held.contact : null, reveal };
}

export interface ListingContactView {
  /** The author row's and the original text's phone; `null` unless the listing has a phone. */
  phone: PhoneControl | null;
  /** The primary action of the CTA bar (`ListingCtaBar`). */
  cta: { onCall: () => void; onWrite: () => void; onOpenPost: () => void };
}

type Control = "call" | "write" | "openPost" | "reveal" | "number";
type CallSource = "author" | "text";

/** The last two digits of a number: the tail its masked form keeps (`splitMaskedPhones`). */
function tailOf(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(-2) : null;
}

/**
 * The contact flows of the listing screen (WP-26 "Contact"): «Позвонить», «Показать номер», the revealed number and
 * a masked number of the original text, «Написать» / «Номер платный» and «Открыть пост». Each tap plays the medium
 * haptic; every contact failure plays the error one (`failed({ toast: false })`: legacy shows no text there) and logs
 * nothing. `contact_call` is sent only when
 * something opened, with `src` `author` from the author row, `text` from the original text and none from the CTA
 * (legacy). Each control ignores a tap while its previous one runs and for `LINK_DEBOUNCE_MS` after it — no haptic,
 * no request, no event — so a double tap is one open and one event, and `openLink` never refuses a repeat that would
 * read as a failure. `listing_id` is the number on screen.
 */
export function useListingContact(number: number, details: ListingDetails | null): ListingContactView {
  const { contact, reveal } = useContact(number);
  const lockedUntil = useRef<Partial<Record<Control, number>>>({});

  const tap = (control: Control, action: () => Promise<void>): void => {
    if (Date.now() < (lockedUntil.current[control] ?? 0)) {
      return;
    }
    lockedUntil.current[control] = Infinity;
    void action().finally(() => {
      lockedUntil.current[control] = Date.now() + LINK_DEBOUNCE_MS;
    });
  };

  /** `tel:` first on Android when the answer has a number, else the call page (TMA-029). */
  const dial = async (found: ContactInfo, src?: CallSource): Promise<void> => {
    const via = await tg.call(found.phone ?? "", found.url);
    if (via === null) {
      failed({ toast: false });
      return;
    }
    track("contact_call", { listing_id: number, via, ...(src && { src }) });
  };

  const call = async (src?: CallSource): Promise<void> => {
    tg.haptic.impact("medium");
    const found = await reveal();
    if (found === null) {
      failed({ toast: false });
      return;
    }
    await dial(found, src);
  };

  /** A number shows itself through the state; a link-only answer opens the call link, as «Позвонить» does. */
  const showNumber = async (src: CallSource): Promise<void> => {
    tg.haptic.impact("medium");
    const found = await reveal();
    if (found === null) {
      failed({ toast: false });
    } else if (found.phone === null) {
      await dial(found, src);
    }
  };

  const write = async (url: string | null): Promise<void> => {
    tg.haptic.impact("medium");
    if (url && tg.openLink(url)) {
      track("contact_write", { listing_id: number });
    } else {
      failed({ toast: false });
    }
  };

  const openPost = async (url: string | null): Promise<void> => {
    tg.haptic.impact("medium");
    openOriginal(number, url, "button");
  };

  const own = contact?.phone ? contact.phone : null;
  const phone: PhoneControl | null = details?.contact.has_phone
    ? {
        display: own === null ? null : (contact?.phoneDisplay ?? own),
        tail: own === null ? null : tailOf(own),
        onReveal: (src) => tap("reveal", () => showNumber(src)),
        onCall: (src) => tap("number", () => call(src)),
      }
    : null;

  return {
    phone,
    cta: {
      onCall: () => tap("call", () => call()),
      onWrite: () => {
        if (details !== null) {
          tap("write", () => write(details.contact.contact_url));
        }
      },
      onOpenPost: () => {
        if (details !== null) {
          tap("openPost", () => openPost(details.original.url));
        }
      },
    },
  };
}
