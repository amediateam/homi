import { useSyncExternalStore } from "react";

import { normaliseAddress } from "@/lib/navigation/history";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { type Launch, parseLaunch } from "./parse";

/**
 * The gate in front of the launch redirect (WP-21): WP-23 registers its check with `setLaunchGate` (the first-launch
 * pickers come first) and calls `releaseLaunchGate` when it opens.
 */

let gate: () => boolean = () => true;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function setLaunchGate(check: () => boolean): void {
  gate = check;
  changed();
}

export function releaseLaunchGate(): void {
  changed();
}

export function launchGate(): boolean {
  try {
    return gate();
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when the gate changed; the redirect checks `launchGate()` again then. */
export function useLaunchGate(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/** What a launch opens (`LaunchRedirector`): its listing, or the filters on the pets section for `?news=pets`. */
export function launchTarget(launch: Launch): string | null {
  if (launch.listingNumber !== null) {
    return routes.listing(launch.listingNumber);
  }
  return launch.news === "pets" ? routes.filters({ focus: "pets" }) : null;
}

let consumed = false;
/** The address the consumed launch opens; `null` when it opens nothing or once the address has shown it. */
let target: string | null = null;
/** The query the Mini App was opened with, read when the module loads: on a gate route the address has none. */
const launchSearch = typeof window === "undefined" ? "" : window.location.search;

/** True once per launch: the redirect runs a single time. */
export function consumeLaunch(): boolean {
  if (consumed) {
    return false;
  }
  consumed = true;
  // What the redirect opens now, from the address it reads (`LaunchRedirector`).
  target = typeof window === "undefined" ? null : launchTarget(parseLaunch(tg.initData(), window.location.search));
  return true;
}

/**
 * Read-only for the navigation (WP-23, D-S-8, BR-APP-055): true while the launch redirect has yet to open its
 * target — before `consumeLaunch()` while the launch names a listing or `?news=pets` (in `start_param` or the query it
 * was opened with), and after it until the address has shown the target's path, i.e. the router committed the push.
 * The first read that sees it forgets the target, so Back from the listing does not make the launch pending again;
 * `GateRedirector` reads it on every address. The city gate waits for it, so a launch by a listing link shows the
 * listing first. Not `history.length`: Chromium caps it at 50, and in Telegram Web the Mini App is an iframe that
 * shares the tab's history.
 */
export function launchPending(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (!consumed) {
    return launchTarget(parseLaunch(tg.initData(), launchSearch)) !== null;
  }
  if (target !== null && normaliseAddress(window.location.pathname) === target.split("?")[0]) {
    target = null;
  }
  return target !== null;
}
