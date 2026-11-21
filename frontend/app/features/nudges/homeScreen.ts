import { displayTimeZone } from "@homi/config";

import { storageGet, storageSet } from "@/lib/storage";

/**
 * The memory of the home-screen offer (WP-31, BR-APP-045; legacy `lib/telegram/homeScreen.js`): `homi-home` holds the
 * last ten days the app was opened and whether the offer was shown, mirrored to Telegram's DeviceStorage and restored
 * from it like every synced key (WP-21). A broken value reads as nothing recorded.
 */
export interface HomeMemory {
  /** Day keys `YYYY-MM-DD`, oldest first, at most `HOME_DAYS_KEPT`. */
  days: string[];
  /** The card was shown once; it is not offered again. */
  offered: boolean;
}

/** Days kept in `homi-home`. */
export const HOME_DAYS_KEPT = 10;
/** Visit days before the offer (BR-APP-045). */
export const HOME_MIN_DAYS = 3;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day key of `now` in Asia/Tashkent (`displayTimeZone`), so a launch at 02:00 there counts for that day — the fix of
 * LB-APP-010, whose key was the UTC date. `en-CA` formats a date as `YYYY-MM-DD`.
 */
export function homeDayKey(now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: displayTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

export function readHomeMemory(): HomeMemory {
  const raw = storageGet("homi-home");
  if (raw === null) {
    return { days: [], offered: false };
  }
  try {
    const value = JSON.parse(raw) as { days?: unknown; offered?: unknown };
    const days = Array.isArray(value.days) ? value.days.filter((day): day is string => typeof day === "string" && DAY_KEY.test(day)) : [];
    return { days: days.slice(-HOME_DAYS_KEPT), offered: value.offered === true };
  } catch {
    return { days: [], offered: false };
  }
}

function writeHomeMemory(memory: HomeMemory): void {
  storageSet("homi-home", JSON.stringify(memory));
}

/** Adds today's key when it is new and keeps the last ten (legacy `recordVisitDay`). */
export function recordVisitDay(now: number = Date.now()): HomeMemory {
  const memory = readHomeMemory();
  const today = homeDayKey(now);
  if (memory.days.includes(today)) {
    return memory;
  }
  const next = { ...memory, days: [...memory.days, today].slice(-HOME_DAYS_KEPT) };
  writeHomeMemory(next);
  return next;
}

/** Whether the visits and the memory allow an offer: three visit days and not offered yet. */
export function homeOfferDue(memory: HomeMemory = readHomeMemory()): boolean {
  return memory.days.length >= HOME_MIN_DAYS && !memory.offered;
}

/** `offered`: `true` once the card was really shown; `false` again when another nudge pushed it away unseen. */
export function setHomeOffered(offered: boolean): void {
  writeHomeMemory({ ...readHomeMemory(), offered });
}
