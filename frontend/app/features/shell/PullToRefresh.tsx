"use client";

import { ArrowDown, Spinner } from "@homi/ui";
import { useRef } from "react";

import { usePullToRefresh } from "./usePullToRefresh";

/**
 * The pull-to-refresh indicator (WP-23, SCR-010), mounted once by `AppShell`: a round glass button, centred, that
 * rests hidden under the top bar (one level below it, legacy `.ptr` at 9) and comes out with the pull — an arrow that
 * turns as the pull nears the trigger, a spinner while the refresh runs (`data-ptr`, written by `usePullToRefresh`
 * with the inline position). It is decoration only (`aria-hidden`, no pointer events); screen-reader users refresh by
 * opening the tab again, as in legacy.
 */
export function PullToRefresh() {
  const indicator = useRef<HTMLDivElement>(null);
  usePullToRefresh(indicator);

  return (
    <div
      ref={indicator}
      aria-hidden
      data-ptr="idle"
      className="group/ptr glass pointer-events-none fixed top-0 left-1/2 z-[calc(var(--z-topbar)-1)] grid size-[40px] place-items-center rounded-pill text-text opacity-0 shadow-(--shadow-float) [transform:translate(-50%,-60px)]"
    >
      <ArrowDown size={20} strokeWidth={2.2} className="group-data-[ptr=refreshing]/ptr:hidden" />
      <Spinner className="hidden text-accent group-data-[ptr=refreshing]/ptr:inline-block" />
    </div>
  );
}
