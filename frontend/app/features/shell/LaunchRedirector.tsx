"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { consumeLaunch, launchGate, launchQuery, launchTarget, useLaunchGate } from "@/lib/deeplinks/launch";
import { parseLaunch } from "@/lib/deeplinks/parse";
import { normaliseAddress } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";

const LAUNCH_PARAMS = ["listing", "news", "owner"];

/**
 * Whether `name` is a launch parameter of `params`: `listing` and `news` always; `owner` only as `owner=new`, since
 * `owner` is also a filter key of the search (`owner=owners`, `@homi/search`) that must stay in the address.
 */
function isLaunchParam(params: Pick<URLSearchParams, "get" | "has"> | null | undefined, name: string): boolean {
  return name === "owner" ? params?.get("owner") === "new" : params?.has(name) === true;
}

/**
 * Opens the target of the launch link once the session is ready and the gate of WP-23 allows it (`25` §3.2,
 * TMA-010 … TMA-012): a listing (`start_param` `l_<n>` or `?listing=`) is pushed over the feed, so Back returns to
 * the feed; `?news=pets` without a listing opens the filters on the pets section. An owner launch (WP-81, TMA-046:
 * `owner_new`, `owner-new`, `?owner=new`) pushes the form like a listing, and `o_<id>` the phone step of that draft
 * after its questionnaire (LB-APP-060); while the reference data says the cabinet is off (DEC-81) the target is
 * dropped, and the launch waits for the reference data before deciding. The `listing`, `news` and `owner` parameters
 * leave the address first, by a replace; each push waits until the router shows the address before it, because two
 * history changes in one tick collapse into one. Whether the bot's buttons use `?listing=` or `startapp` is Q-APP-019;
 * both work.
 */
export function LaunchRedirector(): null {
  const { status, me } = useSession();
  const pickersDone = me !== null && me !== undefined && me.locale_chosen && me.city_chosen;
  const gateVersion = useLaunchGate();
  const { loaded, ownerEnabled } = useReference();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  /** The pushes still to make, in order; each waits until the path `after` shows. */
  const pending = useRef<{ href: string; after: string }[]>([]);

  useEffect(() => {
    if (status !== "ready" || !launchGate()) {
      return;
    }
    // An owner launch is read with the query the app was opened with (the city pick drops the address's), and waits
    // until the first-launch pickers are done and the reference data says whether the cabinet is on.
    const launchedWith = parseLaunch(tg.initData(), launchQuery());
    const owner = launchedWith.listingNumber === null && launchedWith.owner !== null;
    const launch = owner ? launchedWith : parseLaunch(tg.initData(), window.location.search);
    if (owner && (!loaded || !pickersDone)) {
      return;
    }
    if (!consumeLaunch()) {
      return;
    }
    const found = owner && !ownerEnabled ? null : launchTarget(launch);
    // `o_<id>`: the questionnaire first, then its phone step.
    const route = found === null ? null : matchRoute(found);
    const pushes = found === null ? [] : route?.route === "owner" && route.step === "phone" ? [routes.ownerForm(route.id), found] : [found];
    const url = new URL(window.location.href);
    const chain = (start: string) => pushes.map((href, index) => ({ href, after: index === 0 ? start : pushes[index - 1]!.split("?")[0]! }));
    if (!LAUNCH_PARAMS.some((name) => isLaunchParam(url.searchParams, name))) {
      const [first, ...rest] = chain("");
      pending.current = rest;
      if (first !== undefined) {
        nav.push(first.href);
      }
      return;
    }
    for (const name of LAUNCH_PARAMS) {
      if (isLaunchParam(url.searchParams, name)) {
        url.searchParams.delete(name);
      }
    }
    const cleaned = normaliseAddress(url.pathname + url.search);
    pending.current = chain(cleaned.split("?")[0]!);
    nav.replace(cleaned);
  }, [status, gateVersion, loaded, ownerEnabled, pickersDone]);

  useEffect(() => {
    const next = pending.current[0];
    if (next === undefined || LAUNCH_PARAMS.some((name) => isLaunchParam(searchParams, name)) || normaliseAddress(pathname ?? "/") !== next.after) {
      return;
    }
    pending.current = pending.current.slice(1);
    nav.push(next.href);
  }, [searchParams, pathname]);

  return null;
}
