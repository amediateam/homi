import { type Deal, defaultFilters, type SearchFilters, toSearchParams } from "@homi/search";

import { launchListing } from "@/lib/deeplinks/launch";
import { routes } from "@/lib/navigation/routes";

/**
 * The sale switch of a launch listing (WP-38, BR-APP-108, TMA-010; legacy `startListingRef` of `App.jsx` since
 * `index-CIa0Ldj2.js`). When the first full record of the listing the launch link opened (`launchListing`) is a sale
 * and the feed below is not, the listing is marked; closing it to the feed then leaves the sale defaults of the feed's
 * city behind it (`takeSaleSwitch`, read by the one close of the listing layer). Legacy switches the filters while the
 * card is open; HOMI cannot change the address of the page under an intercepted overlay while it shows, so the switch
 * comes with the close (DEC-65). Only that listing and only its first full record count: a later load changes nothing,
 * daily rent switches nothing, the sort is not checked, and opening another listing or leaving the listing for good drops
 * the mark. The first close or final hide of the launch listing ends its check, so the same listing opened later from
 * a list switches nothing, even when it was closed before its record arrived. Module memory of this launch.
 */

/** The launch listing whose first full record was looked at, or that was closed or left before it came. */
let checked: number | null = null;
/** The marked listing and the address of the sale feed its close leaves behind. */
let mark: { number: number; href: string } | null = null;

/** A listing layer shows `number` (its reading instance): the mark of another listing goes. */
export function saleSwitchOpened(number: number): void {
  if (mark !== null && mark.number !== number) {
    mark = null;
  }
}

/**
 * The full record of `number` arrived, with its `deal`. `feed` is the search of the list below (`freshFeed.feed()`),
 * `null` when no list was shown in this launch: the close then reveals the default feed, a rent one, of `city` (the
 * profile's, else the default city).
 */
export function saleSwitchRecord(number: number, deal: Deal | null, feed: SearchFilters | null, city: string | null): void {
  if (checked === number || launchListing() !== number) {
    return;
  }
  checked = number;
  if (deal === "sale" && feed?.deal !== "sale") {
    const filters = defaultFilters("sale", feed?.city ?? city ?? undefined);
    mark = { number, href: routes.feed(toSearchParams(filters)) };
  }
}

/** The launch listing's reference is cleared: it closed, or its layer was left for good. */
function settled(number: number): void {
  if (launchListing() === number) {
    checked = number;
  }
}

/** The close of `number` to the feed: the sale feed's address when it is marked, else `null`. The mark goes. */
export function takeSaleSwitch(number: number): string | null {
  settled(number);
  if (mark === null || mark.number !== number) {
    return null;
  }
  const { href } = mark;
  mark = null;
  return href;
}

/**
 * The layer of `number` hid or unmounted without its close, and the app's stack no longer holds the listing (a Back of
 * the browser, a tab press): its mark goes. A page pushed over the listing (Telegram's Settings button) keeps it.
 */
export function forgetSaleSwitch(number: number): void {
  settled(number);
  if (mark !== null && mark.number === number) {
    mark = null;
  }
}
