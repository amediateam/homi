"use client";

import { type ReactNode, useCallback, useState } from "react";

import { prefersReducedMotion } from "../hooks/prefersReducedMotion";

/** A save button's phase: as usual → the request is on its way → the tick before the sheet closes. */
export type SavePhase = "idle" | "busy" | "done";

/** How long the tick shows before `confirm()` resolves (ms); the shorter one under reduced motion. */
export const SAVE_DONE_MS = 900;
export const SAVE_DONE_REDUCED_MS = 250;

/**
 * The phase of a save button (WP-39, BR-APP-114; legacy `SaveState.jsx` since `index-YX9bFVws.js`). `confirm()` sets
 * `done` and resolves once the tick has been drawn — `SAVE_DONE_MS`, or `SAVE_DONE_REDUCED_MS` under reduced motion
 * (lite graphics still show the tick, as legacy) — so the owner closes its sheet after it.
 */
export function useSavePhase(): { phase: SavePhase; setPhase: (phase: SavePhase) => void; confirm: () => Promise<void> } {
  const [phase, setPhase] = useState<SavePhase>("idle");
  const confirm = useCallback(() => {
    setPhase("done");
    return new Promise<void>((resolve) => {
      setTimeout(resolve, prefersReducedMotion() ? SAVE_DONE_REDUCED_MS : SAVE_DONE_MS);
    });
  }, []);
  return { phase, setPhase, confirm };
}

/**
 * What a save button needs beside its own classes: `{...saveButtonProps(phase)}`. `save-btn` and `data-phase` carry
 * the styles of motion.css — busy clips the button to a 48 px pill around the spinner, done paints it `--good` at
 * full width — and a busy or done button is not dimmed while it is disabled.
 */
export function saveButtonProps(phase: SavePhase): { "data-phase": SavePhase; "data-save": "" } {
  return { "data-phase": phase, "data-save": "" };
}

/**
 * The inside of a save button: the label, which keeps the button's width in every phase, and over it the spinner
 * (busy) or the tick that draws itself (done).
 */
export function SaveState({ phase, children }: { phase: SavePhase; children: ReactNode }) {
  return (
    <span data-slot="save-state" className="inline-grid place-items-center [&>*]:[grid-area:1/1]">
      <span className={phase === "idle" ? "inline-flex items-center gap-2" : "invisible inline-flex items-center gap-2"}>{children}</span>
      {phase === "busy" ? <span data-slot="save-spinner" aria-hidden className="save-spin" /> : null}
      {phase === "done" ? (
        <svg data-slot="save-tick" viewBox="0 0 24 24" aria-hidden className="save-ok size-6">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
        </svg>
      ) : null}
    </span>
  );
}
