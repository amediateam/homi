/**
 * The action log of the Mini App (WP-20): the 21 journal events of `03` §3.3 with their legacy names and properties
 * (16 at the release first audited, five more since `index-DY_DH7h-.js`). `track` hands each one to the journal
 * (`journal.ts`, WP-32: `POST /bff/events` → `POST /api/v1/events`, queued until the session is ready) and keeps the last
 * 20 calls in memory for tests.
 */

import { enqueue } from "./journal";

type Entry = "link" | "news" | "menu";
type Empty = Record<string, never>;

export type JournalEvents = {
  /** `tg`: Telegram's WebApp version, as the client reports it (legacy since `index-BnFvC-Ft.js`). */
  app_launch: { entry: Entry; ms: number; v: string; sdk?: string; js: string; platform: string; tg: string };
  app_opened: { entry: "link"; listing_id: number; ms: number } | { entry: "news" | "menu"; ms: number };
  app_error: {
    v: string;
    error: {
      kind: string;
      name: string;
      message: string;
      source?: string;
      stage?: string;
      screen?: string;
      tg?: string;
      platform?: string;
    };
  };
  follow_prompt_shown: Empty;
  follow_prompt_expired: Empty;
  follow_prompt_closed: Empty;
  /** `n` is the count of the return banner; `custom` is `isCustomFilters` of the filters concerned (BR-APP-013). */
  return_prompt_shown: { n: number; custom: boolean };
  return_prompt_expired: { custom: boolean };
  return_prompt_closed: { custom: boolean };
  feed_radar_shown: { custom: boolean };
  feed_radar_closed: { custom: boolean };
  home_screen_offered: Empty;
  home_screen_closed: Empty;
  home_screen_added: Empty;
  chat_access_declined: Empty;
  chat_access_allowed: Empty;
  listing_shared: { listing_id: number };
  original_opened: { listing_id: number; src: "button" | "video" | "sources" | "price_history" | "offers" };
  original_copied: { listing_id: number };
  /** `src`: none from the action bar (legacy), `author` from the author row (WP-26, HOMI), `text` from the original text. */
  contact_call: { listing_id: number; via: "tel" | "browser"; src?: "text" | "author" };
  contact_write: { listing_id: number };
  /** The owner form's place (WP-81, `03` §3.3): by the map, by «Найти меня», or «Указать вручную». */
  owner_place_set: { source: "map" | "locate" | "manual" };
  /** The fill after «Готово» changed a field, or «Вернуть» undid it. */
  owner_place_autofill: { result: "applied" | "reverted" };
  /** A tap on the mascot of the done step, at most once per 30 s (`features/owner/events.ts`). */
  owner_mascot_tap: Empty;
  /** The owner signals (WP-82, SCR-059, SCR-060): each pair at most once per launch (`features/owner/signals`). */
  owner_attention: { what: "dot" | "coach" | "banner"; action: "shown" | "clicked" };
  /** The limit sheet mounted (WP-82, SCR-049). */
  owner_limit_sheet: { where: "settings" | "mine" };
  /** A fill hint of the owner panel opened the form on its field (WP-82, BR-APP-093). */
  owner_hint_opened: { field: "photos" | "area_m2" | "floor" | "renovation" | "description" };
};

export type JournalEventName = keyof JournalEvents;

export const JOURNAL_EVENTS = [
  "app_launch",
  "app_opened",
  "app_error",
  "follow_prompt_shown",
  "follow_prompt_expired",
  "follow_prompt_closed",
  "return_prompt_shown",
  "return_prompt_expired",
  "return_prompt_closed",
  "feed_radar_shown",
  "feed_radar_closed",
  "home_screen_offered",
  "home_screen_closed",
  "home_screen_added",
  "chat_access_declined",
  "chat_access_allowed",
  "listing_shared",
  "original_opened",
  "original_copied",
  "contact_call",
  "contact_write",
  "owner_place_set",
  "owner_place_autofill",
  "owner_mascot_tap",
  "owner_attention",
  "owner_limit_sheet",
  "owner_hint_opened",
] as const satisfies readonly JournalEventName[];

export type TrackedEvent = { [N in JournalEventName]: { name: N; props: JournalEvents[N] } }[JournalEventName];

const LIMIT = 20;
const recent: TrackedEvent[] = [];

/** Sends a journal event; the props are optional for events without properties. */
export function track<N extends JournalEventName>(
  name: N,
  ...props: JournalEvents[N] extends Empty ? [props?: JournalEvents[N]] : [props: JournalEvents[N]]
): void {
  const value = (props[0] ?? {}) as Record<string, unknown>;
  recent.push({ name, props: value } as TrackedEvent);
  if (recent.length > LIMIT) {
    recent.shift();
  }
  enqueue(name, value);
}

/** The last 20 calls, oldest first; tests only. */
export function recentTracked(): readonly TrackedEvent[] {
  return recent;
}

/** Forgets the kept calls; tests only. */
export function clearTracked(): void {
  recent.length = 0;
}
