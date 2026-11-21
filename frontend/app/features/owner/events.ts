import { track } from "@/lib/analytics/events";

/** `owner_mascot_tap` goes at most once per this time (`03` §3.3). */
export const MASCOT_EVENT_MS = 30_000;

let lastMascotEvent = 0;

/**
 * The owner form's journal events (WP-81, `03` §3.3, LB-APP-058): `owner_place_set` and `owner_place_autofill` go as
 * they happen (the picker); `owner_mascot_tap` at most once per 30 s.
 */
export function trackMascotTap(now: number = Date.now()): void {
  if (now - lastMascotEvent < MASCOT_EVENT_MS) {
    return;
  }
  lastMascotEvent = now;
  track("owner_mascot_tap");
}

/** Tests only. */
export function resetOwnerEvents(): void {
  lastMascotEvent = 0;
}
