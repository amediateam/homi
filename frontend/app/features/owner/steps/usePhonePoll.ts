"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { bffFetch } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";
import { tg } from "@/lib/telegram";

import { normalizeOwnerListing, type OwnerListingView } from "../normalize";
import { type OwnerListingBody, putOwnerListing } from "../store";

/** The poll's rhythm (BR-APP-084). */
export const POLL_EVERY_MS = 1500;
export const POLL_FOR_MS = 90_000;
export const POLL_LATE_MS = 20_000;
/** A `phone_error` equal to the one shown before the tap is stale for this long. */
export const STALE_ERROR_MS = 8000;

export type PollEnd = { kind: "set" } | { kind: "rejected" } | { kind: "error"; error: NonNullable<OwnerListingView["phoneError"]> };
export type PollState = { polling: boolean; late: boolean };

/**
 * The phone poll (WP-81, BR-APP-084), without React: `read` at once, then every 1.5 s without overlap, for up to 90 s,
 * and at once when the app is shown again (`visible`); after 20 s `late`; after 90 s it stops and starts again on the
 * next return. It ends on `phone_set`, on `status: rejected` or on a `phone_error`; a `phone_error` equal to the one
 * shown before the tap is ignored for 8 s as stale. A failed read retries on the next tick.
 */
export class PhonePoll {
  private state: PollState = { polling: false, late: false };
  private readonly listeners = new Set<() => void>();
  private startedAt = 0;
  private staleError: OwnerListingView["phoneError"] = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private live = false;

  constructor(
    private readonly read: () => Promise<ApiResult<OwnerListingBody>>,
    private onEnd: (end: PollEnd) => void,
    private readonly now: () => number = Date.now,
  ) {}

  setOnEnd(onEnd: (end: PollEnd) => void): void {
    this.onEnd = onEnd;
  }

  getState = (): PollState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<PollState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Starts (or restarts) the poll; `staleError` is the error shown before the tap. */
  start(staleError: OwnerListingView["phoneError"]): void {
    this.stop();
    this.startedAt = this.now();
    this.staleError = staleError;
    this.live = true;
    this.set({ polling: true, late: false });
    void this.tick();
  }

  stop(): void {
    this.live = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.state.polling) {
      this.set({ polling: false });
    }
  }

  /** The app is shown again: a read at once, or a new poll when the last one ran out. */
  visible(): void {
    if (this.startedAt === 0) {
      return;
    }
    if (!this.live) {
      this.start(this.staleError);
      return;
    }
    if (!this.busy) {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      void this.tick();
    }
  }

  private end(end: PollEnd): void {
    this.stop();
    this.onEnd(end);
  }

  private async tick(): Promise<void> {
    if (!this.live || this.busy) {
      return;
    }
    const elapsed = this.now() - this.startedAt;
    if (elapsed >= POLL_FOR_MS) {
      this.stop();
      return;
    }
    if (elapsed >= POLL_LATE_MS && !this.state.late) {
      this.set({ late: true });
    }
    this.busy = true;
    const result = await this.read();
    this.busy = false;
    if (!this.live) {
      return;
    }
    if (result.ok) {
      const listing = normalizeOwnerListing(result.data);
      if (listing !== null) {
        putOwnerListing(result.data);
        const stale = listing.phoneError !== null && listing.phoneError === this.staleError && this.now() - this.startedAt < STALE_ERROR_MS;
        if (listing.phoneSet) {
          this.end({ kind: "set" });
          return;
        }
        if (listing.status === "rejected") {
          this.end({ kind: "rejected" });
          return;
        }
        if (listing.phoneError !== null && !stale) {
          this.end({ kind: "error", error: listing.phoneError });
          return;
        }
      }
    }
    this.timer = setTimeout(() => void this.tick(), POLL_EVERY_MS);
  }
}

/** The poll of the phone step: one `PhonePoll` per id, restarted on `tg.onVisible`, stopped on unmount. */
export function usePhonePoll(id: string, onEnd: (end: PollEnd) => void) {
  const [poll] = useState(() => new PhonePoll(() => bffFetch<OwnerListingBody>(`owner/listings/${id}`), onEnd));
  useEffect(() => {
    poll.setOnEnd(onEnd);
  }, [poll, onEnd]);
  const state = useSyncExternalStore(poll.subscribe, poll.getState, poll.getState);
  useEffect(() => tg.onVisible(() => poll.visible()), [poll]);
  useEffect(() => () => poll.stop(), [poll]);
  return { ...state, start: (staleError: OwnerListingView["phoneError"]) => poll.start(staleError), stop: () => poll.stop() };
}
