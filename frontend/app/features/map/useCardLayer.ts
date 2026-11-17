"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

import { usePathname } from "@/i18n/navigation";
import { type DevFlags, devFlags } from "@/lib/flags";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { useLayerState } from "@/lib/navigation/useLayerState";

import type { Selection } from "./types";

/**
 * Where the `pin` layer is: not in the address, pushed and not yet read back, shown, or on its way out. The address
 * reaches the router a render after `pushState`, so "pushed" keeps that render from reading as a Back.
 */
type Phase = "none" | "pushed" | "shown" | "leaving";

/** The map's address without `pin`, written over the current entry. */
function stripPin(query: string): void {
  const next = new URLSearchParams(query);
  next.delete("pin");
  nav.replace(routes.map(next));
}

/**
 * DEV-013 (LB-APP-024, `dev013BackClosesMapCard`, off by default): the open selection card as the `pin` layer of
 * the address (`25` §3.2), so Telegram's Back closes the card and collapses the stack. A selection that opens pushes
 * `pin=<first number>` (a change of the selection while it is open pushes nothing); Back — the layer gone while the
 * selection is open — calls `close`; a selection closed another way (×, a background tap, a new answer) pops the
 * layer with Back, or, when the address changed under it (the deal switch replaces the address and keeps `pin`),
 * removes `pin` with a replace, so the change is not undone; a `pin` the hook did not push (a direct load) is removed
 * with a replace. Only on the map's own address: a listing opened from the card covers the map, which stays mounted
 * with its card. Off: the card is not a history layer, as in legacy, and the hook does nothing.
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

    if (phase.current === "shown" && value === null) {
      phase.current = "none";
      if (open) {
        latest.current.close();
        return;
      }
    }
    if (phase.current === "shown" && !open) {
      phase.current = "leaving";
      if (query === shownQuery.current) {
        latest.current.layer.close();
      } else {
        stripPin(query);
      }
      return;
    }
    if (phase.current === "none" && value !== null) {
      stripPin(query);
      return;
    }
    if (phase.current === "none" && open && first !== null) {
      phase.current = "pushed";
      latest.current.layer.open(String(first));
    }
  }, [on, own, open, first, value, query]);
}
