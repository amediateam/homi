"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { consumeLaunch, launchGate, launchTarget, useLaunchGate } from "@/lib/deeplinks/launch";
import { parseLaunch } from "@/lib/deeplinks/parse";
import { normaliseAddress } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";

const LAUNCH_PARAMS = ["listing", "news"];

/**
 * Opens the target of the launch link once the session is ready and the gate of WP-23 allows it (`25` §3.2,
 * TMA-010 … TMA-012): a listing (`start_param` `l_<n>` or `?listing=`) is pushed over the feed, so Back returns to
 * the feed; `?news=pets` without a listing opens the filters on the pets section. The `listing` and `news`
 * parameters leave the address first, by a replace; the push waits until the router shows the cleaned address,
 * because two history changes in one tick collapse into one. Whether the bot's buttons use `?listing=` or `startapp`
 * is Q-APP-019; both work.
 */
export function LaunchRedirector(): null {
  const { status } = useSession();
  const gateVersion = useLaunchGate();
  const searchParams = useSearchParams();
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "ready" || !launchGate() || !consumeLaunch()) {
      return;
    }
    const target = launchTarget(parseLaunch(tg.initData(), window.location.search));
    const url = new URL(window.location.href);
    if (!LAUNCH_PARAMS.some((name) => url.searchParams.has(name))) {
      if (target !== null) {
        nav.push(target);
      }
      return;
    }
    for (const name of LAUNCH_PARAMS) {
      url.searchParams.delete(name);
    }
    pending.current = target;
    nav.replace(normaliseAddress(url.pathname + url.search));
  }, [status, gateVersion]);

  useEffect(() => {
    if (pending.current !== null && !LAUNCH_PARAMS.some((name) => searchParams?.has(name))) {
      const target = pending.current;
      pending.current = null;
      nav.push(target);
    }
  }, [searchParams]);

  return null;
}
