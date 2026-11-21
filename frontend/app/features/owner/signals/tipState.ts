"use client";

import { useSyncExternalStore } from "react";

import { storageGet, storageSet, subscribeStorage } from "@/lib/storage";

/**
 * The request tips' shared state (WP-82, SCR-060, BR-APP-092, TMA-037): the synced key `homi-req-tip` (default (c):
 * HOMI's name), mirrored to DeviceStorage and restored from it. «×» on either tip, or opening any requests page,
 * writes `done` and hides both at once; a `done` that the restore brings after the first render hides a tip already
 * shown, since every write of the storage module is announced — also a dismissal when the key was `done` already.
 */
export const REQUEST_TIP_DONE = "done";

export function requestTipDone(): boolean {
  return storageGet("homi-req-tip") === REQUEST_TIP_DONE;
}

export function dismissRequestTip(): void {
  storageSet("homi-req-tip", REQUEST_TIP_DONE);
}

/** Whether the tips are dismissed; `true` on the server and in the hydration render, so no tip flashes there. */
export function useRequestTipDone(): boolean {
  return useSyncExternalStore(subscribeStorage, requestTipDone, () => true);
}
