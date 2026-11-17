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

/** How long `backBy` waits for the `popstate` of its steps. */
const POPSTATE_CAP_MS = 500;

/**
 * Steps back over `steps` entries at once (WP-26: the actions sheet, its step layers and the listing close together),
 * never below the first entry of this launch. Resolves with the steps taken once the `popstate` has landed (at most
 * 500 ms); when fewer were taken (a direct load), the caller replaces the address itself — `nav` imports this
 * module, so the fallback is not here.
 */
export function backBy(steps: number): Promise<number> {
  stack();
  const wanted = Math.floor(steps);
  const taken = Number.isNaN(wanted) ? 0 : Math.min(Math.max(0, wanted), depth());
  if (taken === 0) {
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    const done = (): void => {
      window.removeEventListener("popstate", done);
      clearTimeout(timer);
      resolve(taken);
    };
    const timer = setTimeout(done, POPSTATE_CAP_MS);
    window.addEventListener("popstate", done);
    window.history.go(-taken);
  });
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
