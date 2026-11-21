"use client";

import type { components } from "@homi/types";

import { bffFetch } from "@/lib/api/browser";
import { invalidate, seedResource, useResource, type Resource } from "@/lib/data/useResource";
import { useReference } from "@/lib/reference/useReference";
import { refresh } from "@/lib/session/bootstrap";
import { useSession } from "@/lib/session/SessionProvider";

export type OwnerListingBody = components["schemas"]["OwnerListingResource"];
export type OwnerListingsBody = components["schemas"]["OwnerListingsResource"];

/**
 * The one store of the owner cabinet (WP-81; WP-82 extends it, fix of LB-APP-059): every owner read lives under
 * `OWNER_PREFIX`, every answer that is an owner listing is written here by `putOwnerListing`, and every successful
 * mutation calls `invalidateOwner()`, so the list, the pending count and `GET /me`'s `owner` are never stale.
 */
export const OWNER_PREFIX = "owner/";
export const OWNER_LISTINGS_KEY = "owner/listings";

export function ownerListingKey(id: string): string {
  return `owner/listing/${id}`;
}

/** The cabinet's switch of the reference data (DEC-81); `false` until the reference data is there. */
export function useOwnerEnabled(): boolean {
  return useReference().ownerEnabled;
}

/** `GET /owner/listings/{id}` through `/bff`, seeded with the server's read when the page had one. */
export function useOwnerListing(id: string | null, options: { initial?: OwnerListingBody } = {}): Resource<OwnerListingBody> {
  return useResource<OwnerListingBody>(
    id === null ? null : ownerListingKey(id),
    (signal) => bffFetch<OwnerListingBody>(`owner/listings/${id}`, { signal }),
    options.initial === undefined ? {} : { initial: options.initial },
  );
}

/** `GET /owner/listings` through `/bff` (WP-82's «Мои объявления»; the form's limit state). */
export function useOwnerListings(options: { enabled?: boolean } = {}): Resource<OwnerListingsBody> {
  return useResource<OwnerListingsBody>(OWNER_LISTINGS_KEY, (signal) => bffFetch<OwnerListingsBody>("owner/listings", { signal }), {
    enabled: options.enabled ?? true,
  });
}

/** Writes an answer that is an owner listing into its key, as a fresh read. From an effect or a handler only. */
export function putOwnerListing(listing: OwnerListingBody): void {
  seedResource(ownerListingKey(listing.id), listing);
}

/** After a successful mutation: every owner read again, and `GET /me` (its `owner`: pending, has listings). */
export function invalidateOwner(): void {
  invalidate(OWNER_PREFIX);
  void refresh();
}

/** The owner part of `GET /me` (WP-80): the requests waiting on the user's listings, any listing, the waitlist. */
export interface OwnerPending {
  pending: number;
  hasListings: boolean;
  waitlisted: boolean;
}

/**
 * The pending count and the listing flag of the session's `me` (WP-82, BR-APP-091): the red dot, the tab tip, the
 * settings row and the tabs of «Мои объявления» read it; `invalidateOwner()` and a return to the app re-read it.
 */
export function useOwnerPending(): OwnerPending {
  const owner = useSession().me?.owner;
  return {
    pending: owner !== undefined && Number.isFinite(owner.pending) && owner.pending > 0 ? Math.floor(owner.pending) : 0,
    hasListings: owner?.has_listings === true,
    waitlisted: owner?.waitlisted === true,
  };
}
