import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/** The driver that answered a method (`meta.source` of `/api/v1`, `25` §4.3). */
export type DataSource = "stub" | "legacy" | "native";

type State = { pathname: string | null; sources: ReadonlySet<DataSource> };

/**
 * Which drivers answered the screen at the current address (WP-20, `25` §4.4). Kept for one pathname: a report for
 * another pathname, or the marker seeing a new pathname, starts an empty set — so the "demo data" marker clears on
 * navigation and comes back only when an answer of the new screen reports `stub`.
 */
let state: State = { pathname: null, sources: new Set() };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Records that `source` answered a method of the screen at `pathname` (the browser's pathname by default). WP-22
 * calls it from every fetch path; Server Components render `SourceReporter` instead.
 */
export function reportSource(source: DataSource, pathname: string = window.location.pathname): void {
  if (state.pathname === pathname) {
    if (!state.sources.has(source)) {
      emit({ pathname, sources: new Set([...state.sources, source]) });
    }
    return;
  }
  emit({ pathname, sources: new Set([source]) });
}

/** The pathname the screen shows now; an older set is dropped. */
function enter(pathname: string): void {
  if (state.pathname !== pathname) {
    emit({ pathname, sources: new Set() });
  }
}

/**
 * What the server rendered: no report ever reaches it (`SourceReporter` reports from an effect), so the marker is
 * absent from the document. Hydration must start from that, not from the reports of boundaries that hydrated earlier
 * (WP-33: the marker's own `Suspense` hydrates after the page's, whose reporter has run by then — React error 418).
 */
const SERVER_STATE: State = { pathname: null, sources: new Set() };

/** True while an answer of the screen at the current pathname came from a stub. */
export function useHasStubData(): boolean {
  const pathname = usePathname();
  const current = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => enter(pathname), [pathname]);
  return current.pathname === pathname && current.sources.has("stub");
}

/** Forgets every report; tests only. */
export function resetSources(): void {
  emit({ pathname: null, sources: new Set() });
}
