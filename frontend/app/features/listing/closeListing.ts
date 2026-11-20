import { closeThen } from "@/lib/navigation/closeThen";
import { backBy, depth, stack } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";

import { takeSaleSwitch } from "./saleSwitch";

/**
 * The listing layer's leave (WP-26 "Layers, Back and z-order", legacy `LISTING_LEAVE_MS` since `index-CBlEKxdL.js`):
 * the layer slides out over this long (`animate-listing-out`) before the route changes.
 */
export const LISTING_LEAVE_MS = 200;

/** How the close was asked for: the swipe has already slid the layer out, so it changes the route at once. */
export type ListingCloseKind = "leave" | "swipe";

/** A leave plays outside lite graphics (`html.lite`) and without reduced motion; otherwise the layer closes at once. */
export function listingLeavePlays(): boolean {
  if (typeof document === "undefined" || document.documentElement.classList.contains("lite")) {
    return false;
  }
  return !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** The app's stack still holds an entry of listing `number`, its own address or a child (a page was pushed over it). */
export function listingInStack(number: number): boolean {
  return stack().some((entry) => {
    const match = matchRoute(entry.split("?")[0]);
    return match.route === "listing" && match.number === String(number);
  });
}

/** The page one step below the top of the app's stack is the search list (`/`, any search). */
function feedBelow(): boolean {
  const entries = stack();
  const below = entries[entries.length - 2];
  return below !== undefined && matchRoute(below.split("?")[0]).route === "feed";
}

/**
 * The route change that closes the listing layer of `number`, read from the live stack (it may run after an await):
 * one step back when the app pushed a page below, else the replace to the listing's parent, the feed — what `back()`
 * of `useBack()` does at the listing's own address. Says which it made: only a history step can be refused by the
 * client. A launch listing marked by the sale switch (WP-38, `saleSwitch.ts`) leaves the sale feed behind it: the
 * step back and then a replace with that address (`closeThen`, as an apply does, without telling the apply listeners),
 * or the replace alone at depth 0. The mark is taken at once, so the replace never depends on the layer's timers; when
 * the page below is not the feed, the mark only goes.
 */
export function leaveListingRoute(number: number | null): "back" | "replace" {
  const sale = number === null ? null : takeSaleSwitch(number);
  if (depth() > 0) {
    if (sale !== null && feedBelow()) {
      void closeThen(sale);
    } else {
      nav.back();
    }
    return "back";
  }
  nav.replace(sale ?? routes.feed());
  return "replace";
}

/**
 * The history entries the actions sheet's steps pushed over its own address (`useLayerState("step")`): none on the
 * menu, one for `report`, two for `detail` (pushed over `report`). Any other value is one pushed layer; the sheet
 * shows the menu for it.
 */
export function stepLayersOf(step: string | null): 0 | 1 | 2 {
  if (step === null) {
    return 0;
  }
  return step === "detail" ? 2 : 1;
}

/**
 * Closes the actions sheet with all its steps in one move (×, the backdrop, the drag, a support link, a report that
 * keeps the listing). When the app's history holds fewer entries (a direct load), the address is replaced with the
 * listing, so nothing is left of the sheet.
 */
export async function closeActions(number: number, step: string | null): Promise<void> {
  const steps = stepLayersOf(step) + 1;
  if ((await backBy(steps)) < steps) {
    nav.replace(routes.listing(number));
  }
}

/**
 * Closes the actions sheet, its steps and the listing (WP-26: after hide, block, `rented` and a `fraud` report that
 * hid the listing), back to the page the listing was opened from. When the app pushed the listing over a page, the
 * sheet and its steps go first, in one step back that is awaited (two history changes in one tick collapse into one);
 * then `close`, the listing layer's own close (`ListingLayerContext`), plays the leave and changes the route (WP-36).
 * When the listing itself was loaded directly (the app's history holds no page below it), the copy under the sheet is
 * not the one whose `close` this is — the sheet's soft push opened an overlay copy over the standalone one — so the
 * sheet and the listing go in one move without a leave and the feed replaces the address, as before WP-36 — the sale
 * feed when the sale switch marked `number` (WP-38; the mark is taken before the await). History never grows.
 */
export async function closeListing(step: string | null, close: () => void, number: number): Promise<void> {
  const sheet = stepLayersOf(step) + 1;
  if (depth() < sheet + 1) {
    const sale = takeSaleSwitch(number);
    if ((await backBy(sheet + 1)) < sheet + 1) {
      nav.replace(sale ?? routes.feed());
    }
    return;
  }
  await backBy(sheet);
  close();
}
