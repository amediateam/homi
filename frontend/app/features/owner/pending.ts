"use client";

import { useSession } from "@/lib/session/SessionProvider";

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
