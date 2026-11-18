"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

import { usePathname } from "@/i18n/navigation";
import { type DevFlags, devFlags } from "@/lib/flags";
import { closeThen } from "@/lib/navigation/closeThen";
import { depth, replaceTop } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { useLayerState } from "@/lib/navigation/useLayerState";

import type { Selection } from "./types";

/**
 * Where the `pin` layer is: not in the address, pushed and not yet read back, shown, or on its way out. The address
 * reaches the router a render after `pushState`, so "pushed" keeps that render from reading as a Back.
 */
type Phase = "none" | "pushed" | "shown" | "leaving";

/** The map's address without `pin`. */
function withoutPin(query: string): string {
  const next = new URLSearchParams(query);
  next.delete("pin");
  return routes.map(next);
}

/**
 * Steps back over the pushed entry, then replaces the map's address without `pin` (`closeThen`). The app's stack
 * matches a `popstate` by address, so the top entry is first written back as the layer's own (`pin` set): a replace
 * that left it equal to the entry below (a filters apply that kept the search) would make the step read as no step.
 */
function stepOver(query: string, pin: string): void {
  const layer = new URLSearchParams(query);
  layer.set("pin", pin);
  replaceTop(routes.map(layer));
  void closeThen(withoutPin(query));
}

/**
 * DEV-013 (LB-APP-024, `dev013BackClosesMapCard`, off by default): the open selection card as the `pin` layer of
 * the address (`25` §3.2), so Telegram's Back closes the card and collapses the stack. A selection that opens pushes
 * `pin=<first number>` (a change of the selection while it is open pushes nothing); Back — the layer gone while the
 * selection is open — calls `close`; a selection closed another way (×, a background tap, a new answer) pops the
 * layer with Back. An address replaced under the layer (the deal switch keeps `pin`, a filters apply drops it) leaves
 * the pushed entry in the stack holding the new search, so the hook steps back over it and replaces the new address
 * without `pin` (`closeThen`, WP-27 "Selection card"): the root map tab gets no Back that would undo the change. The
 * history level tells the two apart: a Back took the entry, a replace wrote over it. A layer pushed over the card on
 * the map's own address (the map bar's lasso pushes `draw=1` without `pin`) closes it and leaves the pushed entry
 * below; the Back that closes that layer lands there, and the hook pops the entry with one more Back. A `pin` the hook
 * did not push (a direct load) is removed with a replace. Only on the map's own address: a listing opened from the
 * card covers the map, which stays mounted with its card. Off: the card is not a history layer, as in legacy, and the
 * hook does nothing.
 */
export function useCardLayer(selection: Selection, close: () => void, flags: DevFlags = devFlags): void {
  const on = flags.dev013BackClosesMapCard;
  const layer = useLayerState("pin");
  const query = useSearchParams()?.toString() ?? "";
  const own = matchRoute(usePathname()).route === "map";
  const open = selection !== null;
  const first = selection?.numbers[0] ?? null;
  const phase = useRef<Phase>("none");
  /** The query when the pushed layer was read back. */
  const shownQuery = useRef("");
  /** The pushed entry: its history level and its `pin`; `null` until the hook pushes one. */
  const pushed = useRef<{ at: number; pin: string } | null>(null);
  const latest = useRef({ close, layer });

  useLayoutEffect(() => {
    latest.current = { close, layer };
  });

  const value = layer.value;
  useEffect(() => {
    if (!on || !own) {
      return;
    }
    if (phase.current === "pushed" && value !== null) {
      phase.current = "shown";
      shownQuery.current = query;
    } else if (phase.current === "leaving" && value === null) {
      phase.current = "none";
    }

    const entry = pushed.current;
    const entryKept = entry !== null && depth() === entry.at;
    if (phase.current === "shown" && value === null) {
      phase.current = "none";
      if (entryKept) {
        stepOver(query, entry.pin);
      }
      if (open) {
        latest.current.close();
      }
      return;
    }
    if (phase.current === "shown" && !open) {
      phase.current = "leaving";
      if (query === shownQuery.current) {
        latest.current.layer.close();
      } else if (entryKept) {
        stepOver(query, entry.pin);
      } else {
        nav.replace(withoutPin(query));
      }
      return;
    }
    if (phase.current === "none" && value !== null) {
      if (entryKept && value === entry.pin) {
        phase.current = "leaving";
        latest.current.layer.close();
      } else {
        nav.replace(withoutPin(query));
      }
      return;
    }
    if (phase.current === "none" && open && first !== null) {
      phase.current = "pushed";
      latest.current.layer.open(String(first));
      pushed.current = { at: depth(), pin: String(first) };
    }
  }, [on, own, open, first, value, query]);
}
