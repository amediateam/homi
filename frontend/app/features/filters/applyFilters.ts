import {
  type CityRef,
  fixRanges,
  type ListingSort,
  normalizeFilters,
  normalizeSort,
  type SearchFilters,
  type SearchRules,
  sortOptions,
  toSearchParams,
} from "@homi/search";

import { reportError } from "@/lib/errors/report";
import { closeThen } from "@/lib/navigation/closeThen";

export interface ApplyOptions {
  /** The sort of the search the sheet was opened on. */
  sort: ListingSort;
  /** `routes.map` when the sheet was opened from the map (`from=map`), else `routes.feed`. */
  target: (q: URLSearchParams) => string;
  /** The applied city in the reference data (`findCity(next.city)`), for the sorts it offers; `null` when unknown. */
  city: CityRef | null;
  /** `searchRules(devFlags)`: `dev025ValidateRanges` decides whether inverted ranges are swapped (LB-APP-043). */
  rules: SearchRules;
}

type Listener = (filters: SearchFilters) => void;

const listeners = new Set<Listener>();
let applying: Promise<void> | null = null;

/**
 * Called once after every apply of a filters surface with the applied filters (WP-25): the follow nudge of WP-30 and
 * the lasso of WP-28 listen. A listener runs once the replace has been issued, not once it has landed: `router.replace`
 * is a transition, and Next.js writes the new address only when its render commits, so `window.location` and
 * `useSearchParams` still hold the previous search then. A listener reads its argument, never the address; work that
 * needs the new address belongs in an effect of the target screen. Tab switches, deal tabs and the header city pick
 * are not applies and do not call it. Returns the unsubscribe.
 */
export function onFiltersApplied(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyFiltersApplied(filters: SearchFilters): void {
  for (const listener of [...listeners]) {
    try {
      listener(filters);
    } catch (error) {
      reportError(error, { kind: "error", where: "onFiltersApplied" });
    }
  }
}

async function apply(next: SearchFilters, { sort, target, city, rules }: ApplyOptions): Promise<void> {
  const filters = normalizeFilters(fixRanges(next, rules));
  const applied = normalizeSort(sort, sortOptions(filters, city));
  await closeThen(target(toSearchParams(filters, applied)));
  window.scrollTo(0, 0);
  notifyFiltersApplied(filters);
}

/**
 * The one place a filters surface applies (WP-25; «Показать …» of the full and the quick sheet): the ranges fixed by
 * the rules and the filters normalised; the sort kept only if the applied city and filters still offer it, else
 * `new` (BR-APP-023), which the address omits; then `closeThen` to the target — back to the page below and a replace
 * there, or the replace alone at depth 0 (a direct load) — so history never grows. The address carries the 25 keys
 * and `sort` only (`toSearchParams`): `from`, `focus` and `pick` stay behind with the sheet. Once `closeThen` has
 * issued the replace, the page is scrolled to the top and the listeners are told, with the applied filters — before
 * the new address is written (`onFiltersApplied`).
 *
 * A second call while one is on its way returns the first one's promise and does nothing: a double tap would
 * otherwise step back twice and leave the feed.
 */
export function applyFilters(next: SearchFilters, options: ApplyOptions): Promise<void> {
  if (applying === null) {
    applying = apply(next, options).finally(() => {
      applying = null;
    });
  }
  return applying;
}
