import type { SearchFilters } from "@homi/search";
import { useSyncExternalStore } from "react";

import type { Radar } from "@/features/radars/normalize";

/**
 * The one slot of the nudges above the tab bar (WP-30, fix of LB-APP-049): at most one nudge on screen, in a fixed
 * priority — return banner (SCR-046) > follow nudge (SCR-040) > home-screen offer (WP-31). A higher nudge takes the
 * slot from a lower one; a lower one never displaces a higher one.
 *
 * The API, for `NudgeHost` and each nudge's hook (the return banner of WP-30 stage C2, the home offer of WP-31):
 *
 * - `takeSlot(kind)` when the nudge is ready to render (the host's `nudgesAllowed`, no toast): the ticket of this
 *   occupancy, or `null` when a higher nudge holds the slot (the nudge is then dropped, or for the home offer simply
 *   not shown). Every take is a new occupancy with a new ticket, also for the kind that held the slot. A taking return
 *   banner also clears `followPending`: the follow nudge's candidate is dropped (BR-APP-071).
 * - `releaseSlot(kind, ticket?)` when the nudge ends (its timer, ×, its button, a filter change). Only the holder
 *   releases.
 * - A displaced nudge learns it from `useNudgeSlot()` / `subscribeNudgeSlot` (`active` is no longer its kind): the
 *   follow nudge drops itself without an event; the home offer hides without an event and stays available — it asks
 *   `canTakeSlot("home")` again later (WP-31 does not count it as used).
 * - `setFollowPending(true|false)`: a follow-nudge candidate exists (waiting, requesting or ready, not yet rendered).
 * - `setReturnPending(hash|null)`: a return check for that filter hash waits or is in flight. The follow nudge is not
 *   offered while it is the hash of its own filters (BR-APP-046).
 * - `canTakeSlot("home")` holds only when `active === null`, `followPending === false` and `returnPending === null`.
 * - `slotTicket(kind)`: the ticket while `kind` holds the slot — `useMarkShownOnRender` (`shown.ts`) marks a nudge once
 *   per ticket, so the remount of a suspended nudge does not count it again (LB-APP-050).
 */

export type NudgeKind = "return" | "follow" | "home";

export interface NudgeSlot {
  /** The nudge that holds the slot: rendered, or suspended under a toast, a layer or another address. */
  active: NudgeKind | null;
  /** A follow-nudge candidate waits, requests its flow or waits to render. */
  followPending: boolean;
  /** The filter hash of a return check that waits or is in flight. */
  returnPending: string | null;
}

/**
 * What the host sees, rendered by rendered; every nudge hook takes it (`NudgeHost`).
 *
 * - `allowed`: `nudgesAllowed` (BR-APP-046) — the feed list (`/` without a layer parameter) and a ready session.
 * - `layer`: a layer is open — a sheet, a listing or a layer parameter of the search tab.
 * - `filters`: the search of the address while it is a search root (`/` or `/map`), else `null`.
 * - `toast`: a toast of the app's host is visible.
 * - `radars`: the plain radar list of the search tab, `undefined` until it is loaded.
 * - `radarsEnabled`: `useRadarsEnabled()` (DEC-51); `limit`: `useReference().radarLimit`; `referenceLoaded`:
 *   `useReference().loaded`.
 */
export interface NudgeEnv {
  allowed: boolean;
  layer: boolean;
  filters: SearchFilters | null;
  toast: boolean;
  radars: readonly Radar[] | undefined;
  radarsEnabled: boolean;
  limit: number;
  referenceLoaded: boolean;
}

const IDLE: NudgeSlot = { active: null, followPending: false, returnPending: null };

/** Higher takes the slot from lower. */
const RANK: Record<NudgeKind, number> = { home: 1, follow: 2, return: 3 };

let slot: NudgeSlot = IDLE;
/** The ticket of the current occupancy, `0` while the slot is free; tickets only grow, so a mark never repeats. */
let holder = 0;
let lastTicket = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function set(next: NudgeSlot): void {
  if (next.active === slot.active && next.followPending === slot.followPending && next.returnPending === slot.returnPending) {
    return;
  }
  slot = next;
  emit();
}

/** The slot now; the same object until it changes (a `useSyncExternalStore` snapshot). */
export function getNudgeSlot(): NudgeSlot {
  return slot;
}

export function subscribeNudgeSlot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The slot for a component; the server renders no nudge. */
export function useNudgeSlot(): NudgeSlot {
  return useSyncExternalStore(subscribeNudgeSlot, getNudgeSlot, () => IDLE);
}

/**
 * Whether `kind` may take the slot now: the return banner always; the follow nudge unless the return banner holds it;
 * the home offer only when nothing holds it and neither a follow candidate nor a return check waits.
 */
export function canTakeSlot(kind: NudgeKind, state: NudgeSlot = slot): boolean {
  if (kind === "home") {
    return (state.active === null || state.active === "home") && !state.followPending && state.returnPending === null;
  }
  return state.active === null || RANK[state.active] <= RANK[kind];
}

/** Takes the slot for `kind`: the ticket of the new occupancy, or `null` when a higher nudge holds it. */
export function takeSlot(kind: NudgeKind): number | null {
  if (!canTakeSlot(kind)) {
    return null;
  }
  lastTicket += 1;
  holder = lastTicket;
  slot = { ...slot, active: kind, followPending: kind === "return" ? false : slot.followPending };
  emit();
  return holder;
}

/** Gives the slot back when `kind` holds it (and, with `ticket`, only that occupancy). */
export function releaseSlot(kind: NudgeKind, ticket?: number): void {
  if (slot.active !== kind || (ticket !== undefined && ticket !== holder)) {
    return;
  }
  holder = 0;
  set({ ...slot, active: null });
}

/** The ticket while `kind` holds the slot, else `null`. */
export function slotTicket(kind: NudgeKind): number | null {
  return slot.active === kind ? holder : null;
}

export function setFollowPending(pending: boolean): void {
  set({ ...slot, followPending: pending });
}

export function setReturnPending(hash: string | null): void {
  set({ ...slot, returnPending: hash });
}

/** Frees the slot and forgets the pending flags; tests only. Tickets keep growing. */
export function resetNudgeSlot(): void {
  holder = 0;
  set(IDLE);
}
