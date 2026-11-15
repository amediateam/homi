import { useSyncExternalStore } from "react";

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

let consumed = false;

/** True once per launch: the redirect runs a single time. */
export function consumeLaunch(): boolean {
  if (consumed) {
    return false;
  }
  consumed = true;
  return true;
}
