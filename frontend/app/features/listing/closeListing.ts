import { backBy } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";

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
 * Closes the actions sheet, its steps and the listing together (WP-26: after hide, block, `rented` and a `fraud`
 * report that hid the listing), back to the page the listing was opened from. When the app's history holds fewer
 * entries, the address is replaced with the feed. History never grows.
 */
export async function closeListing(step: string | null): Promise<void> {
  const steps = stepLayersOf(step) + 2;
  if ((await backBy(steps)) < steps) {
    nav.replace(routes.feed());
  }
}
