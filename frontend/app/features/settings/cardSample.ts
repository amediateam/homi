"use client";

import { useSyncExternalStore } from "react";

/** The sample card's state on «Вид карточек»: not asked, on its way, in the chat, or not sent. */
export type CardSample = "idle" | "sending" | "sent" | "failed";

let sample: CardSample = "idle";
/** Bumped by every reset: an answer for an older request is dropped. */
let generation = 0;
const listeners = new Set<() => void>();

/**
 * Sets the sample's state. It lives here, not in the page, so it outlives the sub-page as legacy's does, until the
 * next pick or until the settings tab unmounts (LB-APP-053, kept as legacy until it is decided).
 */
export function setCardSample(next: CardSample): void {
  if (next === "idle") {
    generation += 1;
  }
  if (next !== sample) {
    sample = next;
    for (const listener of [...listeners]) {
      listener();
    }
  }
}

/**
 * Marks the sample as on its way and gives the setter of its result, which does nothing once the state was reset
 * meanwhile (a pick, or the tab unmounted): legacy loses an answer that arrives after its screen went.
 */
export function startCardSample(): (result: "sent" | "failed") => boolean {
  setCardSample("sending");
  const asked = generation;
  return (result) => {
    if (asked !== generation) {
      return false;
    }
    setCardSample(result);
    return true;
  };
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
