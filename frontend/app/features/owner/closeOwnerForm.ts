import { locales } from "@homi/config";

import { backBy, depth } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

/**
 * The depth of the page below the form: one less than the depth at which `/owner/new` or `/owner/<id>` first
 * mounted in this opening, `-1` for a form loaded directly (nothing of this launch is below it). `null` while no form
 * is open.
 */
let below: number | null = null;

/** The form's first mount of an opening: remembers the page below it (`OwnerFormLayer`, `OwnerNewRoute`). */
export function markOwnerFormOpened(): void {
  if (below === null) {
    below = depth() - 1;
  }
}

/** The opening ended: the next mount is a new opening. */
export function forgetOwnerForm(): void {
  below = null;
}

const LOCALE_PREFIX = new RegExp(`^/(?:${locales.join("|")})(?=/|$)`);

/** Whether the browser still shows an address of the form (its locale dropped). */
function onFormAddress(): boolean {
  const route = matchRoute(window.location.pathname.replace(LOCALE_PREFIX, "") || "/").route;
  return route === "owner" || route === "ownerNew";
}

/**
 * Closes the form from any of its steps (WP-81, SCR-050 "Back and swipe in the cabinet"): back over every step the
 * form took and its own entry at once (`backBy`), so the page below shows again; when fewer steps were there (a form
 * loaded directly) and the browser still shows a form address, it is replaced by `/settings`, the parent of every
 * address of the form that closes it (`parentOf`). Every close gives a light haptic.
 */
let closing = false;

export async function closeOwnerForm(): Promise<void> {
  // A second Back before the first close has landed is the same close.
  if (closing) {
    return;
  }
  closing = true;
  try {
    await close();
  } finally {
    closing = false;
  }
}

async function close(): Promise<void> {
  tg.haptic.impact("light");
  const wanted = below === null ? 0 : depth() - below;
  forgetOwnerForm();
  const taken = wanted > 0 ? await backBy(wanted) : 0;
  if ((wanted <= 0 || taken < wanted) && onFormAddress()) {
    nav.replace(routes.settings());
  }
}

/**
 * «Мои объявления» inside the form (the limit state, a locked listing, the `limit` rejection, the done step; legacy
 * `App.jsx:815-820`): the form closes, the settings tab is pressed (nothing behind it any more), then the list opens
 * over it.
 */
export async function openMyListings(): Promise<void> {
  await closeOwnerForm();
  nav.tab(routes.settings());
  // Two history changes in one tick collapse into one: the list is pushed once the settings address shows.
  await new Promise<void>((resolve) => {
    const started = Date.now();
    const wait = () => {
      const route = matchRoute(window.location.pathname.replace(LOCALE_PREFIX, "") || "/").route;
      if (route === "settings" || Date.now() - started > 500) {
        resolve();
      } else {
        setTimeout(wait, 16);
      }
    };
    wait();
  });
  nav.push(routes.ownerListings());
}
