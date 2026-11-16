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

type Seen = Pick<Session, "status" | "error" | "pending" | "reason">;

/** The bookkeeping of the one instance; touched only from effects, timers and handlers. */
interface Memory {
  failures: number;
  rechecks: number;
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

/**
 * Reacts to the outcome of an attempt: a sign-in failure waits for the next delay, and after the sixth publishes
 * `failed`; a refusal other than `blocked` is checked again up to three times; `ready`, `expired` and `outside` stop
 * everything. Idempotent: while a timer waits or an attempt is in flight nothing is counted twice.
 */
function observe(memory: Memory, attempt: () => void): void {
  const { status, error, pending, reason } = memory.seen;
  if (status === "ready" || status === "expired" || status === "outside") {
    clearTimer(memory);
    memory.failures = 0;
    memory.rechecks = 0;
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
  memory.failures += 1;
  const delay = BOOT_RETRY_DELAYS_MS[memory.failures - 1];
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
 * - A refusal is checked again 3 times at 2.5 s, never for `blocked`.
 * - Returning to the app (`tg.onVisible`) resets both counters and tries at once — also for `blocked` — while the
 *   session is booting after a failure or refused; while an attempt is in flight it starts nothing.
 * - `expired` and `outside` schedule nothing; `ready` clears whatever was scheduled.
 */
export function useBootRetry(): void {
  const { status, error, pending, reason, retry } = useSession();
  const [settled, setSettled] = useState(0);
  const memory = useRef<Memory>({ failures: 0, rechecks: 0, timer: null, running: false, seen: { status, error, pending, reason } });

  useEffect(() => {
    const current = memory.current;
    current.seen = { status, error, pending, reason };
    observe(current, () => start(current, retry, () => setSettled((count) => count + 1)));
  }, [status, error, pending, reason, retry, settled]);

  useEffect(() => {
    const current = memory.current;
    const restart = () => {
      const { status: now, error: failure, pending: inFlight, reason: why } = current.seen;
      if (inFlight || current.running || !(now === "denied" || (now === "booting" && failure !== null))) {
        return;
      }
      current.failures = 0;
      current.rechecks = 0;
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
