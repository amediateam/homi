import { backBy, depth } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";

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

/**
 * The route change that closes the listing layer, read from the live stack (it may run after an await): one step back
 * when the app pushed a page below, else the replace to the listing's parent, the feed — what `back()` of `useBack()`
 * does at the listing's own address.
 */
export function leaveListingRoute(): void {
  if (depth() > 0) {
    nav.back();
  } else {
    nav.replace(routes.feed());
  }
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
 * hid the listing), back to the page the listing was opened from. The sheet and its steps go first, in one step back
 * that is awaited (two history changes in one tick collapse into one); then `close`, the listing layer's own close
 * (`ListingLayerContext`), plays the leave and changes the route (WP-36). When the app's history holds fewer entries
 * than the sheet (a direct load), the address is replaced with the feed at once, without a leave. History never grows.
 */
export async function closeListing(step: string | null, close: () => void): Promise<void> {
  const steps = stepLayersOf(step) + 1;
  if ((await backBy(steps)) < steps) {
    nav.replace(routes.feed());
    return;
  }
  close();
}
