import type { MessageKey } from "@homi/i18n";

import { isRequestMode, requestStatusOf } from "../cta/owner";
import type { ListingDetails, ListingPreview } from "../listingData";

type Card = Pick<ListingPreview, "is_owner"> & { owner_verified?: boolean; owner?: ListingDetails["owner"] | null };

/**
 * The chip «Проверенный хозяин» (WP-83, BR-APP-100, BR-APP-103): `owner.tier` `self` or `verified`, or a preview with
 * `owner_verified`; never when HOMI marked the author a realtor (`is_owner === false`, default 21).
 */
export function chipShown(card: Card): boolean {
  if (card.is_owner === false) {
    return false;
  }
  const tier = card.owner?.tier ?? null;
  return tier === "self" || tier === "verified" || (card.owner === undefined && card.owner_verified === true);
}

/**
 * The points of «Проверенный хозяин» (SCR-062, DEC-77) that apply, in their order, and its foot: who placed it (a
 * native listing names HOMI), the Telegram-confirmed number, what was checked (HOMI's check for a native listing,
 * legacy's claim for one read from legacy), the gate while in request mode and not `given` (fix of LB-APP-078), the
 * usual response time of a self-placed listing.
 */
export function infoPoints(details: ListingDetails, time: string | null): { points: { key: MessageKey; values?: Record<string, string> }[]; foot: MessageKey } {
  const native = details.origin === "native";
  const tier = details.owner?.tier ?? null;
  const points: { key: MessageKey; values?: Record<string, string> }[] = [];
  if (tier === "self") {
    points.push({ key: native ? "owner.info.selfHomi" : "owner.info.self" });
  } else if (tier === "verified") {
    points.push({ key: "owner.info.verified" });
  }
  points.push({ key: "owner.info.phone" });
  points.push({ key: native ? "owner.info.checked" : "owner.info.notAgent" });
  const requestMode = isRequestMode(details);
  if (requestMode && requestStatusOf(details) !== "given") {
    points.push({ key: "owner.info.gate" });
  }
  if (tier === "self" && time !== null) {
    points.push({ key: "contact.usuallyTime", values: { time } });
  }
  return { points, foot: !native && requestMode ? "owner.info.footGate" : "owner.info.foot" };
}
