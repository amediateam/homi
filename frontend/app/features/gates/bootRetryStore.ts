import { useSyncExternalStore } from "react";

import type { SessionError } from "@/lib/session/bootstrap";

/**
 * What the boot retry of `useBootRetry` (WP-23, D-S-3) shows: a module store, because the one instance in
 * `GateRedirector` owns the timers while the shell and the gate pages read the outcome. Written only from effects
 * and handlers, so the server's copy stays idle.
 */

/** The `ErrorState` kind of a sign-in failure (D-S-1): no network or a timeout, or anything else (`429` included). */
export type BootFailureKind = "offline" | "server";

export function bootFailureKind(error: SessionError): BootFailureKind {
  return error === "offline" || error === "timeout" ? "offline" : "server";
}

export interface BootRetrySnapshot {
  /** The last of the six sign-in attempts failed: the content area shows `ErrorState` until «Повторить». */
  failed: boolean;
  kind: BootFailureKind | null;
  /** An automatic re-check of a refusal is scheduled or running (never for `blocked`): the no-access checking line. */
  checking: boolean;
}

export interface BootRetryState extends BootRetrySnapshot {
  /** «Повторить»: resets the counters and signs in again at once; nothing while an attempt is in flight. */
  retry: () => void;
}

export const BOOT_RETRY_IDLE: BootRetrySnapshot = { failed: false, kind: null, checking: false };

let snapshot: BootRetrySnapshot = BOOT_RETRY_IDLE;
let handler: (() => void) | null = null;
const listeners = new Set<() => void>();

export function publishBootRetry(next: BootRetrySnapshot): void {
  if (next.failed === snapshot.failed && next.kind === snapshot.kind && next.checking === snapshot.checking) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

/** The running instance's «Повторить»; `null` when it unmounts. */
export function setBootRetryHandler(next: (() => void) | null): void {
  handler = next;
}

export function retryBoot(): void {
  handler?.();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBootRetryState(): BootRetryState {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => BOOT_RETRY_IDLE,
  );
  return { ...state, retry: retryBoot };
}

/** Forgets the published outcome and the handler; tests only. */
export function resetBootRetry(): void {
  handler = null;
  publishBootRetry(BOOT_RETRY_IDLE);
}
