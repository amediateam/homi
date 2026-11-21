"use client";

import { useEffect } from "react";

import { getSession, refresh } from "@/lib/session/bootstrap";
import { tg } from "@/lib/telegram";

import { RequestTabTip } from "./RequestTip";

/**
 * The owner's signals in the chrome (WP-82, SCR-060, BR-APP-091): the tab tip above the tab bar, and the re-read of
 * `GET /me` (its pending count) on a return to the app — only for a user whose `me` says `owner.has_listings`
 * (default (a); legacy reads it for everyone, LB-APP-066). The red dot is the tab bar's (`TabBar`).
 */
export function OwnerSignals({ settingsTab, pathname }: { settingsTab: boolean; pathname: string }) {
  useEffect(
    () =>
      tg.onVisible(() => {
        const { status, me } = getSession();
        if (status === "ready" && me?.owner?.has_listings === true) {
          void refresh();
        }
      }),
    [],
  );
  return <RequestTabTip settingsTab={settingsTab} pathname={pathname} />;
}
