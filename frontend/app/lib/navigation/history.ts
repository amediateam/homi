import { isLocale } from "@homi/config";
import { useSyncExternalStore } from "react";

/**
 * The app's own stack of the addresses pushed in this launch (`25` §3.2). `depth` is how many entries lie above
 * the first one; it drives Telegram's BackButton. Addresses are kept without the locale segment, as
 * `lib/navigation/routes.ts` spells them. A `popstate` pops down to the entry of the new address; an address the
 * stack does not know (a forward step, a history the app did not write) starts a new stack.
 */

let entries: string[] | null = null;
const listeners = new Set<() => void>();

/** `/ru/filters?x=1` → `/filters?x=1`; `/ru` → `/`. */
export function normaliseAddress(href: string): string {
  const [pathPart, ...queryParts] = href.split("?");
  const query = queryParts.length > 0 ? `?${queryParts.join("?")}` : "";
  const segments = pathPart.split("/").filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0])) {
    segments.shift();
  }
  return `/${segments.join("/")}${query === "?" ? "" : query}`;
}

function currentAddress(): string {
  return normaliseAddress(window.location.pathname + window.location.search);
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function onPopState(): void {
  const list = stack();
  const index = list.lastIndexOf(currentAddress());
  entries = index >= 0 ? list.slice(0, index + 1) : [currentAddress()];
  notify();
}

/** Starts the stack at the current address; called before every navigation the app makes. */
export function stack(): string[] {
  if (entries === null) {
    entries = [currentAddress()];
    window.addEventListener("popstate", onPopState);
  }
  return entries;
}

export function depth(): number {
  return entries === null ? 0 : entries.length - 1;
}

export function pushEntry(href: string): void {
  stack().push(normaliseAddress(href));
  notify();
}

export function replaceTop(href: string): void {
  const list = stack();
  list[list.length - 1] = normaliseAddress(href);
  notify();
}

/** A tab press or a view switch: nothing is behind the new address any more. */
export function resetDepth(href: string): void {
  stack();
  entries = [normaliseAddress(href)];
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDepth(): number {
  return useSyncExternalStore(subscribe, depth, () => 0);
}
