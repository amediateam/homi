import type { ListingDetails } from "../listingData";

/**
 * The one predicate of request mode (WP-83, fix of LB-APP-078): the card's `contact.mode` is `request` — HOMI's own
 * owner listing, or a legacy self-placed one with the relay on (DEC-71). The CTA bar, the request sheet and the info
 * sheet's gate point and foot all read it.
 */
export function isRequestMode(details: Pick<ListingDetails, "contact">): boolean {
  return details.contact.mode === "request";
}

/** The seeker's request status as the bar reads it; the server's `agent` reaches the seeker as `declined` (BR-APP-098). */
export function requestStatusOf(details: Pick<ListingDetails, "contact">): string | null {
  const status = details.contact.request?.status ?? null;
  return status === "agent" ? "declined" : status;
}

/**
 * The bar of an owner listing (BR-APP-098, DEV-060, DEC-74, DEC-75), or `null` when the listing is not one (then the
 * existing actions decide): `hidden` for a number hidden while the relay is off; in request mode `requestSent` while
 * pending, `given` («Позвонить»), `closed` after `declined` or `cancelled`, and `request` otherwise — `expired` included,
 * which may ask once more and carries the note «Хозяин пока не ответил».
 */
export function ownerCtaOf(
  details: Pick<ListingDetails, "contact">,
): { action: "hidden" | "request" | "requestSent" | "given" | "closed"; note?: "expired"; closed?: "declined" | "cancelled" } | null {
  if (details.contact.mode === "hidden") {
    return { action: "hidden" };
  }
  if (!isRequestMode(details)) {
    return null;
  }
  switch (requestStatusOf(details)) {
    case "pending":
      return { action: "requestSent" };
    case "given":
      return { action: "given" };
    case "expired":
      return { action: "request", note: "expired" };
    case "declined":
      return { action: "closed", closed: "declined" };
    case "cancelled":
      return { action: "closed", closed: "cancelled" };
    default:
      return { action: "request" };
  }
}
