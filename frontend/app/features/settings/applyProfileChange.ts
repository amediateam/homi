"use client";

import type { Currency, Locale } from "@homi/config";
import { bumpFeedEpoch } from "@/features/feed/feedQuery";
import { forgetFeedScroll } from "@/features/feed/feedScroll";
import { invalidate } from "@/lib/data/useResource";
import { patchMe } from "@/lib/session/bootstrap";

/** The watch of the page's `lang` while a saved language waits for its segment. */
let watching: MutationObserver | null = null;

/** Every client read again, the search feed included (its list key does not change: the epoch of WP-38 does). */
function readEverythingAgain(): void {
  invalidate("");
  bumpFeedEpoch();
  forgetFeedScroll();
}

/**
 * The language was saved (WP-31, SCR-035; the fix of LB-APP-041 — no `location.reload()`). The session's profile
 * takes it (`patchMe`), and the locale guard (WP-21, `LocaleGuard`), which follows `me.locale` on every navigation,
 * replaces the address with the same route under the new segment, search parameters kept, through next-intl's router,
 * which also writes its locale cookie. The same guard sends Back from an entry below, which still carries the old
 * segment, to the new one. Checked in the browser: the switch renders in place, with no document load and no new
 * session exchange. Once the document's `lang` is the new locale every client read runs again: `bffFetch` takes its
 * `Accept-Language` from it. The watch is on the document, not on a screen, so a tab switched before the answer
 * still gets its reads.
 */
export function changeLanguage(locale: Locale): void {
  watching?.disconnect();
  watching = null;
  patchMe({ locale });
  const root = document.documentElement;
  const arrived = () => {
    if (root.lang !== locale) {
      return false;
    }
    watching?.disconnect();
    watching = null;
    readEverythingAgain();
    return true;
  };
  if (arrived()) {
    return;
  }
  watching = new MutationObserver(arrived);
  watching.observe(root, { attributes: true, attributeFilter: ["lang"] });
}

/**
 * The currency was saved (WP-31, SCR-036): the profile takes it (`useMoney()` formats with it at once; UZS only while
 * the rate is above 0, WP-22), the server parts render again (`refresh`, the router's `refresh()`: Server Components
 * re-fetched, client state kept), and every client read runs again, server-formatted prices included.
 */
export function changeCurrency(currency: Currency, refresh: () => void): void {
  patchMe({ currency });
  refresh();
  readEverythingAgain();
}

/** Tests only. */
export function resetProfileChange(): void {
  watching?.disconnect();
  watching = null;
}
