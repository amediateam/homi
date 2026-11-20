"use client";

import { filtersHash, filtersKey, type SearchFilters } from "@homi/search";
import { useEffect, useState } from "react";

import { storageGet, storageSet } from "@/lib/storage";
import { tg } from "@/lib/telegram";

import { VISIT_SESSION_GAP_MS, VISITS_KEEP } from "./constants";

/**
 * Search visits (BR-APP-070, since legacy release `index-DY_DH7h-.js`; legacy `recordVisit` of `followNudge.js` and
 * `useVisitTracking` of `useReturnNudge.js`): when each filter set was last on the search tab. The return banner
 * (SCR-046) asks for what is new since the previous visit of the search on screen. `homi-visits` (WP-21: mirrored to
 * DeviceStorage and restored before the first data request, so the first visit of a launch reads the restored map —
 * the race of LB-APP-021 does not occur) holds `{ <filter hash>: ms }`, the 40 newest; the hash is the one of
 * `homi-nudge` (`filtersHash`, so `posted_days` is ignored). Only hashes and times are stored (SEC-REQ-007).
 */

const KEY = "homi-visits";

/** A search visit that was recorded: the return banner's cue. */
export interface SearchVisit {
  filters: SearchFilters;
  hash: string;
  /** The previous visit of these filters (`previousVisit`), `null` for a first one. */
  previous: number | null;
}

const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The `limit` newest entries of a hash → time map. */
function newest(visits: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(visits)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit),
  );
}

/** The stored visits; a value that is not a JSON object reads as none, an entry that is not a time is left out. */
export function readVisits(): Record<string, number> {
  const raw = storageGet(KEY);
  if (raw === null) {
    return {};
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => isTime(entry[1])));
}

/**
 * The visit session (module memory, legacy `sessionVisits`): per hash, the stored time read at its first visit of the
 * session — the previous visit for the rest of the session, while the stored time moves on with every visit. A session
 * starts with the launch (this module's load) and again after a long time in the background (`resetVisitSession`).
 */
const session = new Map<string, number | null>();

/**
 * Records a visit of `filters` at `now`: the stored time moves to `now` (the 40 newest kept) and the answer is the
 * previous visit of these filters in this session — the stored time read at their first visit of the session, `null`
 * when there was none.
 */
export function recordVisit(filters: SearchFilters, now: number = Date.now()): number | null {
  const hash = filtersHash(filters);
  const visits = readVisits();
  if (!session.has(hash)) {
    session.set(hash, visits[hash] ?? null);
  }
  storageSet(KEY, JSON.stringify(newest({ ...visits, [hash]: now }, VISITS_KEEP)));
  return session.get(hash) ?? null;
}

/** The previous visit of `filters` in this session, `null` before their first visit of the session or without one. */
export function previousVisit(filters: SearchFilters): number | null {
  return session.get(filtersHash(filters)) ?? null;
}

/** A new visit session: every filter set reads its stored time again at its next visit. */
export function resetVisitSession(): void {
  session.clear();
}

/** What the tracker sees of the app after a render. */
export interface VisitInput {
  /** The shell's active tab is the search tab (the list, the map or a layer over them). */
  searchTab: boolean;
  /** The search of the address while it is a search root (`/`, `/map`), else `null` (a layer is over it). */
  filters: SearchFilters | null;
  /**
   * The reference data is loaded and the session is ready: the city of an address without one is then the profile's,
   * so the filters are the search the user sees.
   */
  ready: boolean;
}

export interface VisitTrackerDeps {
  /** A visit was recorded on entering the search tab, on a filter change or as a new session began. */
  onVisit: (visit: SearchVisit) => void;
  /** A new visit session began: the radar list is read again (`refreshRadars`). */
  onSession: () => void;
  /**
   * The same long return, after `onSession` and the visit it records (WP-38, BR-APP-104): the search feed decides
   * whether it is re-created or offers its new listings (`features/feed/fresh.ts`).
   */
  onLongReturn?: () => void;
}

export interface VisitTracker {
  /** The app after every render. */
  sync: (input: VisitInput) => void;
  /** `tg.onHidden`. */
  hidden: () => void;
  /** `tg.onVisible`. */
  visible: () => void;
}

/**
 * When a visit is recorded (BR-APP-070; legacy `useVisitTracking`, which watched the tab and the filters):
 *
 * - on entering the search tab — the launch on it included — once its address shows a search (`/` or `/map`) and the
 *   input is `ready`, and on every filter change while on it; the list ↔ map toggle and a layer over the search, a
 *   listing or a sheet, are no new visit (legacy: the tab stayed); a radar's feed («Смотреть найденное», `from=radar`)
 *   records the radar's filters, as legacy did;
 * - when the app goes to the background while on the search tab (`tg.onHidden`, TMA-040): the stored time becomes that
 *   moment, without a cue;
 * - when the app becomes visible after at least 6 h in the background (`tg.onVisible`): a new visit session begins
 *   (`resetVisitSession`), the radar list is read again (`onSession`), on the search tab the visit is recorded once
 *   more with its cue — the return banner's main way back for a Mini App left open (legacy re-armed its check) — and
 *   then the search feed takes the long return (`onLongReturn`, since legacy `index-CIa0Ldj2.js`).
 *
 * Visits are recorded whether radars are switched on or not; only the return banner asks for radars.
 */
export function createVisitTracker(deps: VisitTrackerDeps): VisitTracker {
  let input: VisitInput = { searchTab: false, filters: null, ready: false };
  /** The search of the search tab: the last search root's, kept while a layer covers it. */
  let filters: SearchFilters | null = null;
  /** The `filtersKey` recorded during this stay on the search tab, `null` for none yet. */
  let recorded: string | null = null;
  /** When the app last went to the background, `null` once a session began. */
  let hiddenAt: number | null = null;

  const record = () => {
    if (!input.searchTab || !input.ready || filters === null) {
      return;
    }
    const key = filtersKey(filters);
    if (key === recorded) {
      return;
    }
    recorded = key;
    const previous = recordVisit(filters);
    deps.onVisit({ filters, hash: filtersHash(filters), previous });
  };

  return {
    sync: (next) => {
      input = next;
      if (!next.searchTab) {
        filters = null;
        recorded = null;
        return;
      }
      if (next.filters !== null) {
        filters = next.filters;
      }
      record();
    },
    hidden: () => {
      hiddenAt = Date.now();
      if (input.searchTab && input.ready && filters !== null) {
        recordVisit(filters);
      }
    },
    visible: () => {
      if (hiddenAt === null || Date.now() - hiddenAt < VISIT_SESSION_GAP_MS) {
        return;
      }
      hiddenAt = null;
      resetVisitSession();
      deps.onSession();
      recorded = null;
      record();
      deps.onLongReturn?.();
    },
  };
}

/**
 * The search visits of `NudgeHost` (`createVisitTracker`): the app's state handed over after every render, and
 * `tg.onHidden` / `tg.onVisible` listened to for the host's life. The `deps` of the first render are kept.
 */
export function useSearchVisits(input: VisitInput, deps: VisitTrackerDeps): void {
  const [tracker] = useState(() => createVisitTracker(deps));

  useEffect(() => {
    const offHidden = tg.onHidden(tracker.hidden);
    const offVisible = tg.onVisible(tracker.visible);
    return () => {
      offHidden();
      offVisible();
    };
  }, [tracker]);

  useEffect(() => {
    tracker.sync(input);
  });
}
