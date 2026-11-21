"use client";

import { useEffect, useState } from "react";

import { tg } from "@/lib/telegram";
import type { TgHomeScreenStatus } from "@/lib/telegram/types";

/** Any status the about row and the offer read: Telegram's four. */
export type HomeScreenStatus = TgHomeScreenStatus;

/**
 * The home-screen shortcut's status for the about row (WP-31, SCR-032; legacy `useHomeScreenStatus`): `unsupported`
 * until Telegram answers (and below 8.0 or outside Telegram, where it never asks), then `missed`, `added` or
 * `unknown` (no answer within 1.5 s, TMA-036). Telegram's "added" event, from the row, the nudge or its own menu,
 * turns it into `added`.
 */
export function useHomeScreenStatus(): HomeScreenStatus {
  const [status, setStatus] = useState<HomeScreenStatus>("unsupported");
  useEffect(() => {
    let live = true;
    void tg.homeScreen.status().then((next) => {
      if (live) {
        setStatus(next);
      }
    });
    const stop = tg.homeScreen.onAdded(() => setStatus("added"));
    return () => {
      live = false;
      stop();
    };
  }, []);
  return status;
}
