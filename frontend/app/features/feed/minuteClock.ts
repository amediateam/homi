"use client";

import { useSyncExternalStore } from "react";

/**
 * The minute clock of the card ages (BR-APP-109, legacy `minuteClock.js`): the number of the current minute (ms since
 * the epoch / 60 000) as an external store. While anything listens, the device clock is checked every 15 s and when
 * the app becomes visible, and the listeners hear only of a new minute. The snapshot is read from the clock itself, so
 * a reader that does not listen (the radar strip) still gets the minute of its render.
 */

const CHECK_MS = 15_000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
/** The minute the listeners last heard of. */
let announced = 0;

/** The current minute of the device clock. */
export function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

/** The device clock in ms, for a label computed at render (legacy `ageLabel(item, Date.now())`). */
export function clockNow(): number {
  return Date.now();
}

function check(): void {
  const minute = currentMinute();
  if (minute !== announced) {
    announced = minute;
    listeners.forEach((listener) => listener());
  }
}

/** The first listener starts the check, the last one stops it. */
export function subscribeMinute(listener: () => void): () => void {
  if (listeners.size === 0) {
    announced = currentMinute();
    timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", check);
    }
  };
}

const unsubscribed = () => () => undefined;
const serverMinute = () => null;

/**
 * The current minute; `null` on the server and in the hydration render, whose clock the client does not share, so
 * those print the server's string and the computed label follows after hydration. `live` re-renders the caller on
 * each new minute; without it the minute is read at render only.
 */
export function useMinute(live: boolean): number | null {
  return useSyncExternalStore(live ? subscribeMinute : unsubscribed, currentMinute, serverMinute);
}
