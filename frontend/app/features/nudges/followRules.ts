import { filtersHash, isCustomFilters, type SearchFilters } from "@homi/search";

import { hasSameRadar } from "@/features/radars/match";
import type { Radar } from "@/features/radars/normalize";

import { NUDGE_COOLDOWN_MS } from "./constants";
import type { NudgeState } from "./storage";

export interface FollowRuleInput {
  /** The applied filters. */
  filters: SearchFilters;
  /** The plain radar list of the search tab; `undefined` while it is not loaded, which counts as no radar (legacy). */
  radars: readonly Radar[] | undefined;
  /** `useReference().radarLimit` (`limits.radars`, else 10). */
  limit: number;
  /** `useRadarsEnabled()` (DEC-51). */
  radarsEnabled: boolean;
  /** `readNudgeState()`. */
  state: NudgeState;
  now: number;
}

/**
 * Whether the follow nudge may be offered for `filters` (SCR-040 step 3, BR-APP-043, legacy `shouldShowFollowNudge`):
 * radars are switched on (DEC-51, so nothing is requested while they are off); the filters are custom (BR-APP-013);
 * no radar — on or paused — has the same filters; fewer radars than the limit; the 14-day silence of three closes is
 * over; the last follow nudge or return banner rendered at least 8 h ago; the filters' hash was never offered. A shown
 * return banner counts here: it sets `lastShown` and puts its hash into `asked` (`markReturnShown`). The follow nudge
 * does not wait for the radar list (legacy compared against an empty one).
 */
export function shouldShowFollowNudge({ filters, radars, limit, radarsEnabled, state, now }: FollowRuleInput): boolean {
  const list = radars ?? [];
  return (
    radarsEnabled &&
    isCustomFilters(filters) &&
    !hasSameRadar(filters, list) &&
    list.length < limit &&
    now >= state.quietUntil &&
    now - state.lastShown >= NUDGE_COOLDOWN_MS &&
    !state.asked.includes(filtersHash(filters))
  );
}
