import { getSession } from "@/lib/session/bootstrap";

import { needsLanguage } from "./resolveGate";

/**
 * The gates' memory of this launch (WP-23, D-S-7): module state, as the launch itself is. It is written only from
 * effects and event handlers — `GateRedirector` and the two pickers — so the server's copy keeps its defaults and no
 * request sees another's state.
 */
export interface GateState {
  /**
   * The address the first gate was entered from, without the locale and with its whole query (`?listing=`, `?news=`
   * are read again by the launch redirect when it fires). The city picker replaces it with the feed of the picked
   * city (D-S-10); row 7 returns to it.
   */
  returnTo: string | null;
  /** A locale was picked on `/welcome/language` in this launch: row 5 is passed even while `me` still says otherwise. */
  localePicked: boolean;
  /** A city was picked on `/welcome/city` in this launch: row 6 is passed. */
  cityPicked: boolean;
  /** The address is a gate route (written by `GateRedirector`): a gate page is on screen. */
  onGate: boolean;
}

export const gateState: GateState = { returnTo: null, localePicked: false, cityPicked: false, onGate: false };

/**
 * The launch redirect must wait (`setLaunchGate(() => !isGatePending())`, D-S-7): the ready session still needs a
 * locale (row 5), or a gate page is still on screen — the redirect pushes over the address it finds, and
 * `GateRedirector` releases it once the address is back in the app. The city choice does not hold it back: a listing
 * link opens first and the city page follows (BR-APP-055, row 6 waits for it).
 */
export function isGatePending(): boolean {
  if (gateState.onGate) {
    return true;
  }
  const { status, me } = getSession();
  return status === "ready" && needsLanguage(me, gateState.localePicked);
}

/** Forgets this launch's gate memory; tests only. */
export function resetGateState(): void {
  Object.assign(gateState, { returnTo: null, localePicked: false, cityPicked: false, onGate: false });
}
