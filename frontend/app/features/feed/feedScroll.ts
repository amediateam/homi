/**
 * The scroll memory of the search list (WP-38, BR-APP-105, TMA-023; legacy `feedScrollRef` of `App.jsx` since
 * `index-CIa0Ldj2.js`): one entry, `{ key, y }`, in memory only. `FeedScreen` remembers the position when the list
 * stops being its own address (the map, another tab, Telegram's Settings button, a layer) and takes it back when the
 * list is its own address again: only an entry of the same key restores, any other is dropped. The key is the list
 * key of one `FeedScreen` instance (`feedScrollKey`), so a list re-created by Next's route cache never restores the
 * position of the list it replaced (DEC-63).
 *
 * Forgotten by a press of the active tab, by «Смотреть найденное» and the Back from a radar's feed, and by a long
 * return on another tab; WP-31 forgets it when the hidden list changes.
 */

interface FeedScroll {
  key: string;
  y: number;
}

let memory: FeedScroll | null = null;

/** The memory key of a list: the `FeedScreen` instance (its `useId`) and its list key. */
export function feedScrollKey(instance: string, listKey: string): string {
  return `${instance}#${listKey}`;
}

/** Stores the position of the list `key`, replacing any other. */
export function rememberFeedScroll(key: string, y: number): void {
  memory = { key, y: Number.isFinite(y) ? Math.max(0, y) : 0 };
}

/** The stored position when it is the list `key`'s; the entry stays stored. */
export function peekFeedScroll(key: string): number | null {
  return memory !== null && memory.key === key ? memory.y : null;
}

/** Whether a position is stored at all (the tab bar's arrival on the search tab leaves the scroll to the list then). */
export function hasFeedScroll(): boolean {
  return memory !== null;
}

/**
 * Takes the stored entry: the position when it is the list `key`'s, `"other"` when another list's was stored (the list
 * was re-created meanwhile), `null` when none was. The entry is dropped in every case.
 */
export function takeFeedScroll(key: string): number | "other" | null {
  const taken = memory;
  memory = null;
  if (taken === null) {
    return null;
  }
  return taken.key === key ? taken.y : "other";
}

/** Drops the stored position. */
export function forgetFeedScroll(): void {
  memory = null;
}
