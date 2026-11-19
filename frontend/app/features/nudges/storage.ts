import { storageGet, storageSet } from "@/lib/storage";

import { ASKED_KEEP, BACK_KEEP, CLOSE_QUIET_MS, CLOSE_STREAK, FEED_RADAR_SNOOZE_MS } from "./constants";

/**
 * `homi-nudge` (WP-21 key, mirrored to DeviceStorage and restored before the first data request; legacy `kv-nudge` of
 * `followNudge.js`): how often the nudges may come back. Only filter hashes (`filtersHash` of `@homi/search`) and
 * times in ms are stored, never a filter value (SEC-REQ-007).
 */
export interface NudgeState {
  /** Hashes already offered — by the follow nudge or the return banner — newest first, at most 40. */
  asked: string[];
  /** × in a row of the follow nudge and the return banner; the third silences both (`quietUntil`). */
  closed: number;
  /** No follow nudge and no return banner before this time. */
  quietUntil: number;
  /** When the last follow nudge or return banner rendered (the 8 h cooldown). */
  lastShown: number;
  /** When the return banner last rendered, per filter hash, the 40 newest kept (since `index-DY_DH7h-.js`). */
  back: Record<string, number>;
  /** The radar card in the search list stays away until this time (since `index-DY_DH7h-.js`). */
  feedOff: number;
}

const KEY = "homi-nudge";

/** A fresh default: what a missing or broken value reads as. */
export function emptyNudgeState(): NudgeState {
  return { asked: [], closed: 0, quietUntil: 0, lastShown: 0, back: {}, feedOff: 0 };
}

const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const time = (value: unknown): number => (isTime(value) ? value : 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The `limit` newest entries of a hash → time map. */
function newest(back: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(back)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit),
  );
}

/**
 * The stored value, read the legacy way: not JSON, not an object or an `asked` that is not a list reads as the
 * default as a whole; otherwise each field is taken when it has its type — strings in `asked` (the first 40), finite
 * numbers for the times, a whole number of closes, numeric times in `back` (the 40 newest) — and is its default when
 * it has not (legacy's `NaN` after `closed += 1` on a missing field cannot occur).
 */
function parse(raw: string | null): NudgeState {
  if (raw === null) {
    return emptyNudgeState();
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyNudgeState();
  }
  if (!isRecord(value) || !Array.isArray(value.asked)) {
    return emptyNudgeState();
  }
  const back = isRecord(value.back)
    ? Object.fromEntries(Object.entries(value.back).filter((entry): entry is [string, number] => isTime(entry[1])))
    : {};
  return {
    asked: value.asked.filter((hash): hash is string => typeof hash === "string").slice(0, ASKED_KEEP),
    closed: Math.max(0, Math.floor(time(value.closed))),
    quietUntil: time(value.quietUntil),
    lastShown: time(value.lastShown),
    back: newest(back, BACK_KEEP),
    feedOff: time(value.feedOff),
  };
}

/**
 * The state of this launch when the store refuses writes (KV-FE-080: `localStorage` unavailable → kept in memory for
 * the session). `null` while the store keeps what it is given, so the store stays the one source — DeviceStorage's
 * restore writes into it.
 */
let memory: NudgeState | null = null;

/** The nudge state now (a missing value is the default). */
export function readNudgeState(): NudgeState {
  const raw = storageGet(KEY);
  return raw === null && memory !== null ? memory : parse(raw);
}

/** Stores `state`; a store that refuses the value leaves it in memory for the launch. */
export function writeNudgeState(state: NudgeState): void {
  const raw = JSON.stringify(state);
  storageSet(KEY, raw);
  memory = storageGet(KEY) === raw ? null : state;
}

/** Reads, changes and stores the state in one step; answers the stored state. */
export function updateNudgeState(change: (state: NudgeState) => NudgeState): NudgeState {
  const next = change(readNudgeState());
  writeNudgeState(next);
  return next;
}

const withHashFirst = (asked: readonly string[], hash: string): string[] =>
  [hash, ...asked.filter((other) => other !== hash)].slice(0, ASKED_KEEP);

/** The follow nudge rendered for `hash` (step 5 of SCR-040): its hash first in `asked`, `lastShown = now`. */
export function markFollowShown(hash: string, now: number = Date.now()): void {
  updateNudgeState((state) => ({ ...state, asked: withHashFirst(state.asked, hash), lastShown: now }));
}

/**
 * The return banner rendered for `hash` (step 5 of SCR-046, legacy `markReturnShown`): `back[hash] = now` with the
 * 40 newest kept, `lastShown = now` and the hash first in `asked` — so a shown banner counts as a shown nudge for the
 * follow nudge too (BR-APP-043).
 */
export function markReturnShown(hash: string, now: number = Date.now()): void {
  updateNudgeState((state) => ({
    ...state,
    asked: withHashFirst(state.asked, hash),
    lastShown: now,
    back: newest({ ...state.back, [hash]: now }, BACK_KEEP),
  }));
}

/**
 * × of the follow nudge or of the return banner: one more close in a row; the third sets `quietUntil = now + 14
 * days` and starts the count again (legacy `markNudgeClosed`). The radar card's × does not count.
 */
export function markNudgeClosed(now: number = Date.now()): void {
  updateNudgeState((state) => {
    const closed = state.closed + 1;
    return closed >= CLOSE_STREAK ? { ...state, closed: 0, quietUntil: now + CLOSE_QUIET_MS } : { ...state, closed };
  });
}

/** «Включить» / «Настроить» of any nudge or of the radar card: the close streak starts again (`resetNudgeCloses`). */
export function resetNudgeCloses(): void {
  if (readNudgeState().closed !== 0) {
    updateNudgeState((state) => ({ ...state, closed: 0 }));
  }
}

/** × of the radar card in the search list (SCR-047): hidden on every search for 7 days. */
export function snoozeFeedRadar(now: number = Date.now()): void {
  updateNudgeState((state) => ({ ...state, feedOff: now + FEED_RADAR_SNOOZE_MS }));
}

/** Forgets the in-memory stand-in; tests only. */
export function resetNudgeMemory(): void {
  memory = null;
}
