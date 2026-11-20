import { filtersHash, type SearchFilters } from "@homi/search";

import { hasRadarFor } from "@/features/radars/match";
import type { Radar } from "@/features/radars/normalize";

import { NUDGE_COOLDOWN_MS, RETURN_AWAY_MS, RETURN_REPEAT_MS } from "./constants";
import type { NudgeState } from "./storage";

/**
 * The rules of the return banner (SCR-046, BR-APP-071; legacy `returnSince` of `followNudge.js`). The module is
 * `returnRules`, not `returnNudge`: on a case-insensitive file system `./returnNudge` would also find `ReturnNudge.tsx`.
 */

export interface ReturnDueInput {
  /** The search of the visit. */
  filters: SearchFilters;
  /** The previous visit of these filters in this session (`SearchVisit.previous`), `null` for a first one. */
  previous: number | null;
  /** `readNudgeState()`. */
  state: NudgeState;
  now: number;
}

export interface ReturnRuleInput extends ReturnDueInput {
  /** The plain radar list of the search tab, loaded. */
  radars: readonly Radar[];
  /** `useReference().radarLimit` (`limits.radars`, else 10). */
  limit: number;
  /** `useRadarsEnabled()` (DEC-51). */
  radarsEnabled: boolean;
}

/**
 * The half of `shouldCheckReturn` that needs no radar list, asked at the visit already: the previous visit of these
 * filters was at least 6 h ago; the 14-day silence of three closes is over; the last follow nudge or return banner
 * rendered at least 8 h ago (the cooldown shared with the follow nudge, BR-APP-043); no banner for these filters in
 * the last 2 days (`back[hash]`).
 */
export function returnDue({ filters, previous, state, now }: ReturnDueInput): boolean {
  if (previous === null || now - previous < RETURN_AWAY_MS) {
    return false;
  }
  const back = state.back[filtersHash(filters)];
  return now >= state.quietUntil && now - state.lastShown >= NUDGE_COOLDOWN_MS && (back === undefined || now - back >= RETURN_REPEAT_MS);
}

/**
 * Whether the return check may ask `GET /listings/new` (step 2 of SCR-046): radars are switched on (DEC-51, so nothing
 * is requested while they are off); no radar covers the search — none with the same filters, on or paused, and for
 * default filters none of the same base deal in the same city (`hasRadarFor`); fewer radars than the limit; and
 * `returnDue`.
 */
export function shouldCheckReturn(input: ReturnRuleInput): boolean {
  const { filters, radars, limit, radarsEnabled } = input;
  return radarsEnabled && !hasRadarFor(filters, radars) && radars.length < limit && returnDue(input);
}

export { newCount } from "./newCount";
