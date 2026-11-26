"use client";

import { useEffect, useRef, useState } from "react";

import { type Session, useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";

import { BOOT_RETRY_IDLE, bootFailureKind, publishBootRetry, setBootRetryHandler } from "./bootRetryStore";

/** BR-APP-054: the waits after the 1st … 5th failed sign-in; the 6th failure shows `ErrorState` (≈ 0/1/4/11/26/56 s). */
export const BOOT_RETRY_DELAYS_MS = [1_000, 3_000, 7_000, 15_000, 30_000] as const;

/** BR-APP-054: a refusal is checked again this often, at this interval, never for `blocked`. */
export const RECHECK_COUNT = 3;
export const RECHECK_DELAY_MS = 2_500;

/**
 * KI-37: the one wait of a `429` sign-in — its `Retry-After`, at most a minute; this long when it gave none. It is
 * not one of the six failures.
 */
export const RATE_LIMIT_WAIT_MAX_MS = 60_000;
export const RATE_LIMIT_WAIT_DEFAULT_MS = 10_000;

/** The wait before the attempt after a `429`: `Retry-After` (seconds) capped at a minute, else the default. */
export function rateLimitWaitMs(retryAfter: number | null): number {
  if (retryAfter === null || !Number.isFinite(retryAfter) || retryAfter < 0) {
    return RATE_LIMIT_WAIT_DEFAULT_MS;
  }
  return Math.min(retryAfter * 1000, RATE_LIMIT_WAIT_MAX_MS);
}

type Seen = Pick<Session, "status" | "error" | "retryAfter" | "pending" | "reason">;

/** The bookkeeping of the one instance; touched only from effects, timers and handlers. */
interface Memory {
  failures: number;
  rechecks: number;
  /** The one uncounted wait of a `429` was spent since the counters were last reset. */
  rateLimitWaited: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** An attempt this hook started has not settled yet. */
  running: boolean;
  /** The session as the last render saw it, for the handlers. */
  seen: Seen;
}

function clearTimer(memory: Memory): void {
  if (memory.timer !== null) {
    clearTimeout(memory.timer);
    memory.timer = null;
  }
}

/** One attempt now. When it settles the hook renders again and reads the outcome from the session. */
function start(memory: Memory, retry: () => Promise<void>, settled: () => void): void {
  clearTimer(memory);
  memory.running = true;
  void retry()
    .catch(() => undefined)
    .finally(() => {
      memory.running = false;
      settled();
    });
}

function resetCounters(memory: Memory): void {
  memory.failures = 0;
  memory.rechecks = 0;
  memory.rateLimitWaited = false;
}

/**
 * Reacts to the outcome of an attempt: a sign-in failure waits for the next delay, and after the sixth publishes
 * `failed`; the first `429` since the counters were reset waits for its `Retry-After` instead and is not counted (a
 * later one is an ordinary failure); a refusal other than `blocked` is checked again up to three times; `ready`,
 * `expired` and `outside` stop everything. Idempotent: while a timer waits or an attempt is in flight nothing is
 * counted twice.
 */
function observe(memory: Memory, attempt: () => void): void {
  const { status, error, retryAfter, pending, reason } = memory.seen;
  if (status === "ready" || status === "expired" || status === "outside") {
    clearTimer(memory);
    resetCounters(memory);
    publishBootRetry(BOOT_RETRY_IDLE);
    return;
  }
  if (pending || memory.running || memory.timer !== null) {
    return;
  }
  if (status === "denied") {
    if (reason === "blocked" || memory.rechecks >= RECHECK_COUNT) {
      publishBootRetry(BOOT_RETRY_IDLE);
      return;
    }
    memory.rechecks += 1;
    memory.timer = setTimeout(() => {
      memory.timer = null;
      attempt();
    }, RECHECK_DELAY_MS);
    publishBootRetry({ ...BOOT_RETRY_IDLE, checking: true });
    return;
  }
  if (error === null) {
    return;
  }
  if (error === "rate_limited" && !memory.rateLimitWaited) {
    memory.rateLimitWaited = true;
    memory.timer = setTimeout(() => {
      memory.timer = null;
      attempt();
    }, rateLimitWaitMs(retryAfter));
    return;
  }
  memory.failures += 1;
  const ladder = BOOT_RETRY_DELAYS_MS[memory.failures - 1];
  // A counted `429` still never retries inside the window the API named.
  const delay = ladder === undefined || error !== "rate_limited" ? ladder : Math.max(ladder, rateLimitWaitMs(retryAfter));
  if (delay === undefined) {
    publishBootRetry({ failed: true, kind: bootFailureKind(error), checking: false });
    return;
  }
  memory.timer = setTimeout(() => {
    memory.timer = null;
    attempt();
  }, delay);
}

/**
 * The timers of BR-APP-054 around `retry()` of the session (WP-23, D-S-3). Exactly one instance runs, in
 * `GateRedirector`; the shell and the gate pages read its outcome with `useBootRetryState()` of `./bootRetryStore`,
 * which imports neither the session nor `tg`.
 *
 * - A sign-in that failed without an answer (network, timeout, server, `429`) is tried again after 1, 3, 7, 15 and
 *   30 s — six attempts in all; after the sixth failure the content area shows `ErrorState` with «Повторить», which
 *   resets the counter and tries at once.
 * - The first `429` (KI-37) is tried again after its `Retry-After` — at most 60 s, 10 s without one — and is not
 *   counted; another `429` after that counts as above, and waits at least its `Retry-After` (same cap). «Повторить» and returning to the app allow that wait again.
 * - A refusal is checked again 3 times at 2.5 s, never for `blocked`.
 * - Returning to the app (`tg.onVisible`) resets both counters and tries at once — also for `blocked` — while the
 *   session is booting after a failure or refused; while an attempt is in flight it starts nothing.
 * - `expired` and `outside` schedule nothing; `ready` clears whatever was scheduled.
 */
export function useBootRetry(): void {
  const { status, error, retryAfter, pending, reason, retry } = useSession();
  const [settled, setSettled] = useState(0);
  const memory = useRef<Memory>({
    failures: 0,
    rechecks: 0,
    rateLimitWaited: false,
    timer: null,
    running: false,
    seen: { status, error, retryAfter, pending, reason },
  });

  useEffect(() => {
    const current = memory.current;
    current.seen = { status, error, retryAfter, pending, reason };
    observe(current, () => start(current, retry, () => setSettled((count) => count + 1)));
  }, [status, error, retryAfter, pending, reason, retry, settled]);

  useEffect(() => {
    const current = memory.current;
    const restart = () => {
      const { status: now, error: failure, pending: inFlight, reason: why } = current.seen;
      if (inFlight || current.running || !(now === "denied" || (now === "booting" && failure !== null))) {
        return;
      }
      resetCounters(current);
      publishBootRetry({ ...BOOT_RETRY_IDLE, checking: now === "denied" && why !== "blocked" });
      start(current, retry, () => setSettled((count) => count + 1));
    };
    setBootRetryHandler(restart);
    const stop = tg.onVisible(restart);
    return () => {
      stop();
      setBootRetryHandler(null);
      clearTimer(current);
      publishBootRetry(BOOT_RETRY_IDLE);
    };
  }, [retry]);
}
