import { vi } from "vitest";

const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

/**
 * Fixes `Date` and the timers of a Vitest test at an instant given in UTC, and returns the function that gives the
 * real clock back. Timers fire only when the test advances them (`vi.advanceTimersByTime`). `queueMicrotask` and
 * promises keep running, so asynchronous callbacks of the fake Telegram still arrive.
 */
export function freezeClock(instant: string): () => void {
  if (!isoUtc.test(instant)) {
    throw new Error(`freezeClock needs an ISO-8601 UTC timestamp ending in "Z", got "${instant}"`);
  }
  vi.useFakeTimers({ now: new Date(instant) });
  return () => {
    vi.useRealTimers();
  };
}
