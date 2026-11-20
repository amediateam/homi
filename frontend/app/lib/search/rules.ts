import type { SearchRules } from "@homi/search";

import { type DevFlags, devFlags } from "@/lib/flags";

/** The one place where the app's flags become the `rules` argument of `@homi/search` (WP-22). */
export function searchRules(flags: DevFlags = devFlags): SearchRules {
  return {
    dev017TenantPetsDailyRule: flags.dev017TenantPetsDailyRule,
    dev017PetsLongRentOnly: flags.dev017PetsLongRentOnly,
    dev018ResetKeepsDaily: flags.dev018ResetKeepsDaily,
    dev025ValidateRanges: flags.dev025ValidateRanges,
    dev052UnifiedBelowMedianRule: flags.dev052UnifiedBelowMedianRule,
    dev005RadarDropsPostedDays: flags.dev005RadarDropsPostedDays,
  };
}
