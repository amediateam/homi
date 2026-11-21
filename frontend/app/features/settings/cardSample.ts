"use client";

import { useSyncExternalStore } from "react";

/** The sample card's state on «Вид карточек»: not asked, on its way, in the chat, or not sent. */
export type CardSample = "idle" | "sending" | "sent" | "failed";

let sample: CardSample = "idle";
const listeners = new Set<() => void>();

/**
 * Sets the sample's state. It lives here, not in the page, so it outlives the sub-page as legacy's does, until the
 * next pick or until the settings tab unmounts (LB-APP-053, kept as legacy until it is decided).
 */
export function setCardSample(next: CardSample): void {
  if (next !== sample) {
    sample = next;
    for (const listener of [...listeners]) {
      listener();
    }
  }
}

export function useCardSample(): CardSample {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => sample,
    () => "idle",
  );
}
