import type { MessageKey } from "@homi/i18n";
import { useSyncExternalStore } from "react";

/** SCR-042: a plain toast stays this long. */
export const TOAST_MS = 4000;

/** SCR-042: a toast with an action button stays this long. */
export const TOAST_ACTION_MS = 6000;

/** Where a toast shows: the app's host in the root layout, or the one inside the filters sheet (WP-25). */
export type ToastScope = "app" | "sheet";

/**
 * What a toast says: a ready text; a text with an action button (`run` is called once, then the toast closes; an
 * undo may return the promise of its Server Action, whose rejection the host reports); or a catalogue key with its
 * values, translated by the host in the current locale.
 */
export type ToastMessage =
  | string
  | { text: string; action: string; run: () => void | Promise<unknown> }
  | { key: MessageKey; values?: Record<string, string | number> };

/** A toast on screen. Every `showToast` gives a new `id`, so the host remounts and the replacement rises in again. */
export interface ShownToast {
  id: number;
  message: ToastMessage;
}

const shown = new Map<ToastScope, ShownToast>();
const timers = new Map<ToastScope, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let lastId = 0;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function hasAction(message: ToastMessage): boolean {
  return typeof message === "object" && "action" in message;
}

/**
 * Shows a toast (SCR-042, WP-23). One toast per scope: a new one replaces the visible one and restarts the timer —
 * 4 s for a plain toast, 6 s for one with an action. The store owns the timers, so a toast keeps its time whatever
 * the host does.
 */
export function showToast(message: ToastMessage, scope: ToastScope = "app"): void {
  clearTimeout(timers.get(scope));
  const id = ++lastId;
  shown.set(scope, { id, message });
  timers.set(
    scope,
    setTimeout(() => dismissToast(scope, id), hasAction(message) ? TOAST_ACTION_MS : TOAST_MS),
  );
  notify();
}

/**
 * Closes the toast of `scope`. With `id`, only that toast: the host closes the one it showed, so a toast shown by an
 * action's `run` is not closed with it.
 */
export function dismissToast(scope: ToastScope = "app", id?: number): void {
  const current = shown.get(scope);
  if (current === undefined || (id !== undefined && current.id !== id)) {
    return;
  }
  clearTimeout(timers.get(scope));
  timers.delete(scope);
  shown.delete(scope);
  notify();
}

/** The toast of `scope` now, or `null`; the same object until it changes (a `useSyncExternalStore` snapshot). */
export function currentToast(scope: ToastScope = "app"): ShownToast | null {
  return shown.get(scope) ?? null;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The toast of `scope` for the host; the server renders none. */
export function useToast(scope: ToastScope = "app"): ShownToast | null {
  return useSyncExternalStore(
    subscribeToasts,
    () => currentToast(scope),
    () => null,
  );
}
