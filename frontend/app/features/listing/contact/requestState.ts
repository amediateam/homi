"use client";

import { useSyncExternalStore } from "react";

import { invalidate, readResource, seedResource } from "@/lib/data/useResource";

import { listingKey, type ListingRecord } from "../listingData";

/**
 * The per-number request state of this launch (WP-83, DEC-85): a listing whose request answered `409 request_closed`
 * while its card, read again, still offers a request — the owner closed his requests to this seeker only — keeps the
 * closed bar until the launch ends, so the button does not come back. The server never says why.
 */
const closedHere = new Set<number>();
const listeners = new Set<() => void>();
let version = 0;

function announce(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function closeRequestsHere(number: number): void {
  closedHere.add(number);
  announce();
}

export function useRequestClosedHere(number: number | null): boolean {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => 0,
  );
  return number !== null && closedHere.has(number);
}

/** Tests only. */
export function resetRequestState(): void {
  closedHere.clear();
  announce();
}

/** The request's answered status written into the card at once (a local patch of `contact.request`). */
export function patchRequestStatus(number: number, status: string): void {
  const record = readResource<ListingRecord>(listingKey(number));
  if (record === undefined) {
    return;
  }
  const listing = record.listing;
  seedResource(listingKey(number), {
    ...record,
    listing: { ...listing, contact: { ...listing.contact, request: { status: status as never, sent_at: new Date().toISOString() } } },
  });
}

/** The card read again in the background; the shown details stay until the answer (WP-26, fix of LB-APP-074). */
export function rereadListing(number: number): void {
  invalidate(listingKey(number));
}
