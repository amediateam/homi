import { baseDeal, type Deal, isCustomFilters, type SearchFilters } from "@homi/search";

import { hasRadarFor } from "@/features/radars/match";
import type { Radar } from "@/features/radars/normalize";

import type { NudgeState } from "./storage";

/**
 * The radar card in the search list (SCR-047, BR-APP-072, since legacy release `index-DY_DH7h-.js`; legacy
 * `shouldShowFeedRadar` of `followNudge.js`): its conditions and texts. It is not a nudge — it scrolls with the list
 * in the `inline` slot of WP-24, never takes the slot of `NudgeHost`, and its × counts towards no streak.
 */

export interface FeedRadarInput {
  /** The search of the list. */
  filters: SearchFilters;
  /** The plain radar list of the search tab, `undefined` until it is loaded. */
  radars: readonly Radar[] | undefined;
  /** `useReference().radarLimit` (`limits.radars`, else 10). */
  limit: number;
  /** `useRadarsEnabled()` (DEC-51). */
  radarsEnabled: boolean;
  /** `useReference().loaded`. */
  referenceLoaded: boolean;
  /** The card's × is still in force (`feedRadarSnoozed`). */
  snoozed: boolean;
}

/** The card's × hides it on every search until `feedOff` (7 days after the ×). */
export function feedRadarSnoozed(state: NudgeState, now: number): boolean {
  return now < state.feedOff;
}

/**
 * Whether the list shows the card: radars are switched on (DEC-51: nothing offers one while they are off), the
 * reference data and the radar list are loaded, no radar covers the search (`hasRadarFor`: the same filters, on or
 * paused, and for default filters any radar of the same base deal in the same city), fewer radars than the limit, and
 * no × in the last 7 days. Neither the nudges' cooldown nor their silence applies (legacy).
 */
export function shouldShowFeedRadar({ filters, radars, limit, radarsEnabled, referenceLoaded, snoozed }: FeedRadarInput): boolean {
  return radarsEnabled && referenceLoaded && radars !== undefined && !hasRadarFor(filters, radars) && radars.length < limit && !snoozed;
}

export type FeedRadarTitleKey = "feedRadar.titleRent" | "feedRadar.titleSale";
export type FeedRadarButtonKey = "feedRadar.enable" | "feedRadar.setup";

/** «Хорошие квартиры снимают в первые часы» for rent, daily rent included; «Выгодные квартиры продают быстро» for sale. */
export function feedRadarTitleKey(deal: Deal): FeedRadarTitleKey {
  return baseDeal(deal) === "sale" ? "feedRadar.titleSale" : "feedRadar.titleRent";
}

/** «Включить радар» turns one on for custom filters; «Настроить радар» opens «Новый радар» for default ones. */
export function feedRadarButtonKey(filters: SearchFilters): FeedRadarButtonKey {
  return isCustomFilters(filters) ? "feedRadar.enable" : "feedRadar.setup";
}

/** The filter hashes whose card was seen in this launch (module memory, legacy `useRef(Set)` of `App`). */
const seen = new Set<string>();

/** Whether `feed_radar_shown` was sent for the search of this filter hash (`filtersHash`) in this launch. */
export function feedRadarSeen(hash: string): boolean {
  return seen.has(hash);
}

/** Notes the card of this filter hash as seen; `true` the first time in this launch, so the event goes once per hash. */
export function markFeedRadarSeen(hash: string): boolean {
  if (seen.has(hash)) {
    return false;
  }
  seen.add(hash);
  return true;
}

/** Forgets the seen cards; tests only. */
export function resetFeedRadarSeen(): void {
  seen.clear();
}
