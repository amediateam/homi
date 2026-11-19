"use client";

import { useEffect } from "react";

import { type NudgeKind, slotTicket } from "./store";

/** The last occupancy of the slot that was marked, per kind (tickets of `store.ts`, which only grow). */
const marked = new Map<NudgeKind, number>();

/**
 * Shown means rendered (fix of LB-APP-050; legacy marked a nudge when it was scheduled): `mark` — `lastShown`,
 * `asked`, `back` and the nudge's `*_shown` event — runs in the effect of the nudge's first render in the slot, once
 * per occupancy of the slot (`slotTicket`). A re-render, or the remount after a toast or a layer suspended the nudge,
 * marks nothing again; a nudge dropped before it rendered never reaches this effect and leaves no trace. A component
 * that renders while its kind does not hold the slot marks nothing.
 */
export function useMarkShownOnRender(kind: NudgeKind, mark: () => void): void {
  useEffect(() => {
    const ticket = slotTicket(kind);
    if (ticket === null || marked.get(kind) === ticket) {
      return;
    }
    marked.set(kind, ticket);
    mark();
  });
}
