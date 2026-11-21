"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { trackScreen } from "@/lib/analytics/posthog";
import { currentScreen, setScreen } from "@/lib/analytics/screens";
import { usePathname } from "@/i18n/navigation";
import { matchRoute, screenNameOf } from "@/lib/navigation/routes";

/** The listing whose pageview waits for its record or its failure, and the last listing whose screen knew either. */
let awaited: number | null = null;
let known: number | null = null;
/** The listings known to be the user's own: their pageview is named `owner/listing` (WP-82). */
const own = new Set<number>();

const listingScreen = (number: number) => (own.has(number) ? "owner/listing" : "listing");

/**
 * The listing screen knows its record or its failure (`ListingScreen`): its pageview goes now if the address is still
 * that listing's. Legacy since `index-CIa0Ldj2.js`: a card closed before that sends none.
 */
export function listingKnown(number: number, options: { mine?: boolean } = {}): void {
  known = number;
  if (options.mine === true) {
    own.add(number);
  } else {
    own.delete(number);
  }
  if (awaited === number) {
    awaited = null;
    trackScreen(listingScreen(number), { listing_id: number });
  }
}

/**
 * The one screen tracker (WP-32, fix of LB-APP-037): on every change of address it names the screen (`screenNameOf`),
 * sets it for error reports at once (`setScreen`) and sends the pageview (`trackScreen`), with `listing_id` on a
 * listing's addresses. The listing's own pageview waits until its record or its failure is known (`listingKnown`).
 * Route components do not track; the map's selection card pushes its name (`useScreenLayer`).
 */
export function ScreenTracker(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const name = screenNameOf(pathname, searchParams);
  const matched = matchRoute(pathname);
  const listing = matched.route === "listing" ? Number(matched.number) : null;

  useEffect(() => {
    setScreen(name);
    awaited = null;
    if (name === "listing" && listing !== null) {
      if (known === listing) {
        trackScreen(listingScreen(listing), { listing_id: listing });
      } else {
        awaited = listing;
      }
      return;
    }
    // A layer without an address on top (the map's card) stays the screen: the pageview is the top's.
    const top = currentScreen();
    trackScreen(top, top !== name || listing === null ? {} : { listing_id: listing });
  }, [name, listing]);
  return null;
}

/** Tests only. */
export function resetScreenTracker(): void {
  awaited = null;
  known = null;
  own.clear();
}
