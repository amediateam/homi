"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import { tg } from "@/lib/telegram";

import type { MePosition } from "./types";

/** The answers of `tg.location.get()` that are not a position: the map shows them in its note. */
export type LocateFailure = "denied" | "fail";

export interface Locate {
  /** The adapter can ask for a position (`tg.location.available()`); `false` on the server and at hydration. */
  available: boolean;
  /** A request is pending: the button spins and is disabled. */
  busy: boolean;
  /** The last position found, a new object per success, so the view flies to it again. */
  me: MePosition | null;
  locate: () => void;
}

function subscribeNever(): () => void {
  return () => undefined;
}

function serverUnavailable(): boolean {
  return false;
}

/**
 * "Where am I" of the map (KV-FE-031, TMA-035): a light haptic, then `tg.location.get()`, which settles within the
 * 12 s cap of WP-21; a position plays the success haptic and becomes `me`, `denied` and `fail` go to `onFailure`.
 * The position stays in this state: it is never stored, logged or sent.
 */
export function useLocate(onFailure: (failure: LocateFailure) => void): Locate {
  const available = useSyncExternalStore(subscribeNever, tg.location.available, serverUnavailable);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<MePosition | null>(null);

  const locate = useCallback(() => {
    if (busy) {
      return;
    }
    tg.haptic.impact();
    setBusy(true);
    tg.location.get().then(
      (result) => {
        setBusy(false);
        if (typeof result === "object") {
          tg.haptic.success();
          setMe({ lat: result.lat, lon: result.lon, accuracy: result.accuracy });
        } else {
          onFailure(result);
        }
      },
      () => {
        setBusy(false);
        onFailure("fail");
      },
    );
  }, [busy, onFailure]);

  return { available, busy, me, locate };
}
