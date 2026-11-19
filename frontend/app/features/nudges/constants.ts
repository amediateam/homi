import { INLINE_SLOT_AFTER } from "@/features/feed/inlineSlot";

/**
 * Every number of the nudges (WP-30, `03` §3.4, legacy `followNudge.js`, `useFollowNudge.js`, `useReturnNudge.js`,
 * `Nudges.jsx`): the follow nudge (SCR-040), the return banner (SCR-046) and the radar card in the search list
 * (SCR-047). The cooldown, the close streak and the snooze are shared by the follow nudge and the return banner; the
 * radar card counts towards neither.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** SCR-040: the wait after an apply, once the feed list shows the applied filters with no toast (BR-APP-043). */
export const FOLLOW_DELAY_MS = 1_800;

/** SCR-040: the follow nudge hides itself this long after it rendered (`follow_prompt_expired`). */
export const FOLLOW_SHOW_MS = 10_000;

/** Between any two shown nudges, the follow nudge or the return banner (`lastShown`, BR-APP-043, BR-APP-071). */
export const NUDGE_COOLDOWN_MS = 8 * HOUR_MS;

/** Closes in a row (× of the follow nudge or of the return banner) that silence both. */
export const CLOSE_STREAK = 3;

/** How long the close streak silences them (`quietUntil = now + 14 days`). */
export const CLOSE_QUIET_MS = 14 * DAY_MS;

/** Filter hashes kept in `asked` (offered once each), newest first. */
export const ASKED_KEEP = 40;

/** SCR-046: the wait after a recorded visit before the `GET /listings/new` check (BR-APP-071). */
export const RETURN_DELAY_MS = 1_800;

/** SCR-046: the return banner hides itself this long after it rendered (`return_prompt_expired`). */
export const RETURN_SHOW_MS = 15_000;

/** SCR-046: the previous visit of a filter set must be at least this old for the return check (BR-APP-070). */
export const RETURN_AWAY_MS = 6 * HOUR_MS;

/** A visit session starts again when the app becomes visible after at least this long in the background. */
export const VISIT_SESSION_GAP_MS = RETURN_AWAY_MS;

/** SCR-046: the banner comes back for one filter set at most once in this long (`back[hash]`). */
export const RETURN_REPEAT_MS = 2 * DAY_MS;

/** Banner times kept in `back`, the newest by time. */
export const BACK_KEEP = 40;

/** Search visits kept in `homi-visits`, the newest by time (BR-APP-070). */
export const VISITS_KEEP = 40;

/** SCR-047: the radar card follows this many cards of the search list (the `inline` slot of WP-24). */
export const FEED_RADAR_AFTER = INLINE_SLOT_AFTER;

/** SCR-047: × hides the radar card on every search this long (`feedOff = now + 7 days`). */
export const FEED_RADAR_SNOOZE_MS = 7 * DAY_MS;

/** SCR-047: the share of the radar card that must be visible for `feed_radar_shown` (`IntersectionObserver`). */
export const FEED_RADAR_SEEN_RATIO = 0.6;
