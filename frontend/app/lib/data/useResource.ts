"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { type ApiFailure, failureOf } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import { type DevFlags, devFlags } from "@/lib/flags";
import { onForbidden } from "@/lib/session/bootstrap";

/**
 * The small client data hook of WP-22 (`25` §3.5; no query library, DEC-49). One module-level map in memory, keyed
 * by `key`: `initial` (the server's read in cookie mode) seeds it, equal keys share one in-flight request, a key
 * change or the last unmount aborts and forgets an entry without data (an old failure never reaches the next mount,
 * which seeds or shows its pending state), a fresh entry is reused and a stale one is shown while it refetches — with
 * `cacheComponents` hidden routes re-run their effects when shown again, and the stale check is what stops a
 * refetch storm on every Back. A failed read keeps the data that is already on screen (`03` §1.6).
 *
 * The map is never written on the server: a Server-rendered Client Component sees `initial` only, so one user's
 * data can never reach another request.
 */

export type Fetcher<T> = (signal: AbortSignal) => Promise<ApiResult<T>>;
export type ResourceStatus = "idle" | "loading" | "success" | "error";

export interface ResourceOptions<T> {
  initial?: T;
  enabled?: boolean;
  staleMs?: number;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

export interface Resource<T> {
  data: T | undefined;
  error: ApiFailure | null;
  status: ResourceStatus;
  /** A read is in flight while data is shown. */
  refreshing: boolean;
  refetch: () => Promise<void>;
  mutate: (updater: (current: T | undefined) => T) => void;
}

interface Snapshot {
  data: unknown;
  error: ApiFailure | null;
  inflight: boolean;
}

interface Entry {
  snapshot: Snapshot;
  fetchedAt: number;
  users: number;
  controller: AbortController | null;
  promise: Promise<void> | null;
  fetcher: Fetcher<unknown> | null;
  flags: DevFlags;
}

const EMPTY: Snapshot = { data: undefined, error: null, inflight: false };
/** `fetchedAt` of an entry seeded from `initial` during render; the seeding commit stamps the time. */
const SEEDED = -1;
const DEFAULT_STALE_MS = 30_000;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ensure(key: string): Entry {
  let entry = entries.get(key);
  if (entry === undefined) {
    entry = { snapshot: EMPTY, fetchedAt: 0, users: 0, controller: null, promise: null, fetcher: null, flags: devFlags };
    entries.set(key, entry);
  }
  return entry;
}

function write(entry: Entry, change: Partial<Snapshot>): void {
  entry.snapshot = { ...entry.snapshot, ...change };
  emit();
}

function load(key: string, fetcher: Fetcher<unknown>, flags: DevFlags): Promise<void> {
  const entry = ensure(key);
  entry.fetcher = fetcher;
  entry.flags = flags;
  if (entry.promise !== null) {
    return entry.promise;
  }
  const controller = new AbortController();
  entry.controller = controller;
  write(entry, { inflight: true });

  const settle = (change: Partial<Snapshot>) => {
    if (!controller.signal.aborted && entries.get(key) === entry) {
      write(entry, { ...change, inflight: false });
    }
  };
  entry.promise = fetcher(controller.signal)
    .then(
      (result) => {
        if (result.ok) {
          entry.fetchedAt = Date.now();
          settle({ data: result.data, error: null });
          return;
        }
        settle({ error: result });
        if (result.error === "forbidden" && entry.flags.dev001AnyForbiddenShowsAccess && !controller.signal.aborted) {
          onForbidden();
        }
      },
      (error: unknown) => {
        // A fetcher rejects only for an abort; anything else is a bug, shown as "could not load".
        const aborted = error instanceof DOMException && error.name === "AbortError";
        settle(aborted ? {} : { error: failureOf({ method: "GET", path: key }, { status: 0 }) });
      },
    )
    .finally(() => {
      if (entry.controller === controller) {
        entry.controller = null;
        entry.promise = null;
      }
    });
  return entry.promise;
}

function abort(entry: Entry): void {
  entry.controller?.abort();
  entry.controller = null;
  entry.promise = null;
}

function retain(key: string): void {
  ensure(key).users += 1;
}

function release(key: string): void {
  const entry = entries.get(key);
  if (entry === undefined) {
    return;
  }
  entry.users -= 1;
  if (entry.users > 0) {
    return;
  }
  const reading = entry.controller !== null;
  if (reading) {
    abort(entry);
  }
  if (entry.snapshot.data === undefined) {
    entries.delete(key);
  } else if (reading) {
    entry.snapshot = { ...entry.snapshot, inflight: false };
  } else {
    return;
  }
  emit();
}

/** Drops every entry whose key starts with `prefix`; a key that is on screen is read again. */
export function invalidate(prefix: string): void {
  for (const [key, entry] of [...entries]) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    abort(entry);
    if (entry.users > 0 && entry.fetcher !== null) {
      entry.fetchedAt = 0;
      void load(key, entry.fetcher, entry.flags);
    } else {
      entries.delete(key);
    }
  }
  emit();
}

/**
 * Writes `data` into the entry of `key` as a fresh read and tells every user at once (WP-26: the listing seeds the
 * number a merged listing answered with before it replaces the address). Called from an effect or a handler, never
 * during render.
 */
export function seedResource<T>(key: string, data: T): void {
  const entry = ensure(key);
  entry.fetchedAt = Date.now();
  write(entry, { data, error: null, inflight: false });
}

/**
 * The data the entry of `key` holds now, `undefined` without one — the read of code outside a component (WP-30: the
 * radar lists, which a mutation rewrites through `seedResource`). It does not subscribe and never reads.
 */
export function readResource<T>(key: string): T | undefined {
  return entries.get(key)?.snapshot.data as T | undefined;
}

/** Forgets every entry; tests only. */
export function resetResources(): void {
  for (const entry of entries.values()) {
    abort(entry);
  }
  entries.clear();
  emit();
}

function statusOf(snapshot: Snapshot, active: boolean): ResourceStatus {
  if (snapshot.error !== null) {
    return "error";
  }
  if (snapshot.data !== undefined) {
    return "success";
  }
  return active ? "loading" : "idle";
}

export function useResource<T>(key: string | null, fetcher: Fetcher<T>, options: ResourceOptions<T> = {}): Resource<T> {
  const { initial, enabled = true, staleMs = DEFAULT_STALE_MS, flags = devFlags } = options;
  const active = key !== null && enabled;

  if (typeof window !== "undefined" && key !== null && initial !== undefined && !entries.has(key)) {
    // Seeding during render: a plain write without `emit`, so no other component re-renders mid-render.
    entries.set(key, { ...ensure(key), snapshot: { data: initial, error: null, inflight: false }, fetchedAt: SEEDED });
  }

  // The seed above is announced by its commit, whether or not this user reads: a user of the key that committed
  // earlier with nothing (a child route outside the listing's boundary, WP-26) re-reads only on an `emit`. `seeds`
  // also covers an `initial` that arrives after the first commit.
  const seeds = initial !== undefined;
  useLayoutEffect(() => {
    const entry = key === null ? undefined : entries.get(key);
    if (entry?.fetchedAt === SEEDED) {
      entry.fetchedAt = Date.now();
      emit();
    }
  }, [key, seeds]);

  const fetcherRef = useRef<Fetcher<T>>(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const serverSnapshot = useMemo<Snapshot>(() => (initial === undefined ? EMPTY : { data: initial, error: null, inflight: false }), [initial]);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (key === null ? EMPTY : (entries.get(key)?.snapshot ?? serverSnapshot)),
    () => serverSnapshot,
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    retain(key);
    const entry = ensure(key);
    // Kept even when nothing is read now, so `invalidate` can read a seeded entry again.
    entry.fetcher = fetcherRef.current as Fetcher<unknown>;
    entry.flags = flags;
    if (entry.promise === null && (entry.snapshot.data === undefined || Date.now() - entry.fetchedAt >= staleMs)) {
      void load(key, fetcherRef.current as Fetcher<unknown>, flags);
    }
    return () => release(key);
  }, [active, key, staleMs, flags]);

  return {
    data: snapshot.data as T | undefined,
    error: snapshot.error,
    status: statusOf(snapshot, active),
    refreshing: snapshot.inflight && snapshot.data !== undefined,
    refetch: () => (key === null ? Promise.resolve() : load(key, fetcherRef.current as Fetcher<unknown>, flags)),
    mutate: (updater) => {
      if (key !== null) {
        const entry = ensure(key);
        write(entry, { data: updater(entry.snapshot.data as T | undefined) });
      }
    },
  };
}
