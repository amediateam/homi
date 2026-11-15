"use client";

import { useSyncExternalStore } from "react";

/**
 * What this launch changed, in memory only (`03` §1.11, WP-22): favourite toggles, listings opened and listings
 * hidden or blocked. Each overrides the server's flag (`favorite`, `viewed`, the server-side filter of hidden
 * listings) until a reload; after one the server is the truth again. The settings' hidden screen calls
 * `resetHidden()` after any change, as legacy does.
 */

type Maps = {
  favs: ReadonlyMap<number, boolean>;
  seen: ReadonlySet<number>;
  hidden: ReadonlySet<number>;
};

export type SessionMapName = keyof Maps;

const EMPTY: Maps = { favs: new Map(), seen: new Set(), hidden: new Set() };
let maps: Maps = EMPTY;
const listeners = new Set<() => void>();

function change(next: Partial<Maps>): void {
  maps = { ...maps, ...next };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setFav(number: number, on: boolean): void {
  change({ favs: new Map(maps.favs).set(number, on) });
}

export function markSeen(number: number): void {
  if (!maps.seen.has(number)) {
    change({ seen: new Set(maps.seen).add(number) });
  }
}

export function hide(numbers: readonly number[]): void {
  change({ hidden: new Set([...maps.hidden, ...numbers]) });
}

export function unhide(numbers: readonly number[]): void {
  const hidden = new Set(maps.hidden);
  for (const number of numbers) {
    hidden.delete(number);
  }
  change({ hidden });
}

export function resetHidden(): void {
  change({ hidden: new Set() });
}

export function isFavorite(number: number, server: boolean): boolean {
  return maps.favs.get(number) ?? server;
}

export function isSeen(number: number, server: boolean): boolean {
  return server || maps.seen.has(number);
}

export function isHidden(number: number): boolean {
  return maps.hidden.has(number);
}

export function useSessionMap<N extends SessionMapName>(name: N): Maps[N] {
  return useSyncExternalStore(
    subscribe,
    () => maps[name],
    () => EMPTY[name],
  );
}

/** Forgets every override; tests only. */
export function resetSessionMaps(): void {
  change(EMPTY);
}
