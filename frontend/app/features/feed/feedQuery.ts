import { type ListingSort, type SearchFilters, toApiQuery, toSearchParams } from "@homi/search";

import { type DevFlags, devFlags } from "@/lib/flags";
import { searchRules } from "@/lib/search/rules";

/**
 * The query and the list key of the search feed, shared by `FeedServer` (page one with the cookie) and `FeedScreen`
 * (the list in the browser). No React and no Next.js: both sides must build the same strings for the same address,
 * or the browser drops the server's page one and asks again (25 §3.4).
 */

/** Items per page of the search feed (BR-APP-024). */
export const FEED_PAGE_SIZE = 20;

/** The refresh version of a list nobody has pulled yet, and of the server's page one. */
export const FIRST_VERSION = 0;

/** `GET /listings` of page one: the v1 filters, the sort unless `new`, and 20 items (BR-APP-024). */
export function feedQuery(filters: SearchFilters, sort: ListingSort, flags: DevFlags = devFlags): URLSearchParams {
  return toApiQuery(filters, { sort, rules: searchRules(flags), limit: FEED_PAGE_SIZE });
}

/**
 * The search a list belongs to: the canonical address query of `toSearchParams`, which always carries the city.
 * Not `filtersKey()`, which ignores `posted_days` (BR-APP-012): the list must be re-created when that changes.
 */
export function feedSearchKey(filters: SearchFilters, sort: ListingSort): string {
  return toSearchParams(filters, sort).toString();
}

/** The list key of `useCursorFeed`: the search and the refresh version, so a pull re-creates the list (SCR-010). */
export function feedListKey(filters: SearchFilters, sort: ListingSort, version: number = FIRST_VERSION): string {
  return `${feedSearchKey(filters, sort)}|${version}`;
}

/**
 * The feed epoch (WP-38, BR-APP-104): a counter of this launch that re-creates the search list without a pull. A bump
 * counts as one pull of the search the feed shows (`FeedScreen`), so the list reads page one itself, while another
 * search starts again from `FIRST_VERSION` and adopts its server page one: `FeedServer` always keys page one with
 * `FIRST_VERSION`. A feed hidden by `cacheComponents` takes the bump when it is shown again, and its list reads page
 * one only then. Bumped by a long return (`features/feed/fresh.ts`), a tap on the fresh pill, and WP-31.
 */
let epoch = 0;
const epochListeners = new Set<() => void>();

export function feedEpoch(): number {
  return epoch;
}

/** Re-creates the search list: the filters and the sort stay, only the list moves. */
export function bumpFeedEpoch(): void {
  epoch += 1;
  for (const listener of [...epochListeners]) {
    listener();
  }
}

export function subscribeFeedEpoch(listener: () => void): () => void {
  epochListeners.add(listener);
  return () => {
    epochListeners.delete(listener);
  };
}
