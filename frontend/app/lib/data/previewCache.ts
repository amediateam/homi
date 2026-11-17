import type { components } from "@homi/types";

type ListingPreview = components["schemas"]["ListingPreviewResource"];

/**
 * The cards of opened listings, in module memory for this launch (WP-24): a card tap stores its preview, and the
 * listing screen (WP-26) paints it at once while the full card loads (legacy passed it as `preview`, `03` SCR-007).
 * The last 200 stored cards are kept; storing a number again makes it the newest.
 */

const LIMIT = 200;
const previews = new Map<number, ListingPreview>();

export function setPreview(number: number, card: ListingPreview): void {
  previews.delete(number);
  previews.set(number, card);
  if (previews.size > LIMIT) {
    const oldest = previews.keys().next().value;
    if (oldest !== undefined) {
      previews.delete(oldest);
    }
  }
}

export function getPreview(number: number): ListingPreview | null {
  return previews.get(number) ?? null;
}

/** Forgets every card; tests only. */
export function resetPreviews(): void {
  previews.clear();
}
