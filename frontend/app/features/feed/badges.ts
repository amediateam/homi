import type { MessageKey } from "@homi/i18n";

import type { ListingPreview } from "./types";
import { verdictToneOf } from "./verdict";

export type BadgeKind = "suspiciousCheap" | "checkPrice" | "ownerVerified" | "owner" | "belowMarket";

/** `warn` for the two price warnings, `good` for «Ниже рынка», `plain` for the owner marks. */
export type BadgeTone = "warn" | "good" | "plain";

export interface CardBadge {
  kind: BadgeKind;
  tone: BadgeTone;
  key: MessageKey;
}

/**
 * The one badge over a card's photo (BR-APP-026, BR-API-111), first match wins: «Подозрительно дёшево» >
 * «Проверьте цену» > «Хозяин ✓» > «Хозяин» > «Ниже рынка». The pinned order is that of `index-Dbpp463V.js` and
 * later, where «Хозяин» ranks above «Ниже рынка». The tones come from the verdict, so they need a delta as well
 * (`verdictToneOf`): «Ниже рынка» is the tone `good`, not any negative delta.
 */
export function cardBadge(item: Pick<ListingPreview, "market" | "is_owner" | "owner_verified">): CardBadge | null {
  const tone = verdictToneOf(item.market);
  if (tone === "suspicious") {
    return { kind: "suspiciousCheap", tone: "warn", key: "card.suspiciousCheap" };
  }
  if (tone === "check") {
    return { kind: "checkPrice", tone: "warn", key: "card.checkPrice" };
  }
  if (item.owner_verified) {
    return { kind: "ownerVerified", tone: "plain", key: "card.ownerVerified" };
  }
  if (item.is_owner) {
    return { kind: "owner", tone: "plain", key: "card.owner" };
  }
  if (tone === "good") {
    return { kind: "belowMarket", tone: "good", key: "card.belowMarket" };
  }
  return null;
}
