import { track } from "@/lib/analytics/events";
import { tg } from "@/lib/telegram";

/** Where the original post was opened from: the `src` of `original_opened`. */
export type OriginalSource = "button" | "video" | "sources" | "price_history" | "offers";

/**
 * Opens an address of the original post through `tg.openLink` and logs `original_opened` only when it opened:
 * `false` without an address, on a refused host or a repeated tap. Plays no haptic; the caller owns its tap's.
 */
export function openOriginal(number: number, url: string | null, src: OriginalSource): boolean {
  if (url === null || !tg.openLink(url)) {
    return false;
  }
  track("original_opened", { listing_id: number, src });
  return true;
}
