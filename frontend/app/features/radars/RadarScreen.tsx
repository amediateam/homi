"use client";

import { ErrorState, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";

import { seedResource } from "@/lib/data/useResource";
import { type DevFlags, devFlags } from "@/lib/flags";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";
import { registerRefresh } from "@/lib/ui/shellState";

import { useRadarsEnabled } from "./capability";
import type { Radar } from "./normalize";
import { RadarEmptyState } from "./RadarEmptyState";
import { clearRadarReturn } from "./radarReturn";
import { RadarSoonState } from "./RadarSoonState";
import { RadarTiles, useRadarSwitch } from "./RadarTiles";
import { useRadarPreviews } from "./useRadarPreviews";
import { type RadarList, RADARS_PREVIEWS_KEY, useRadars } from "./useRadars";

export interface RadarScreenProps {
  /** The server's read with the previews (cookie mode, `readRadarTab`), normalised; absent otherwise. */
  initial?: Radar[];
  /** New per server render that read the user; a new value is adopted once (`useAdoptedRender`). */
  renderId: string;
  /** The server saw radars switched off: what the tab shows until the reference data reaches the client. */
  serverOff: boolean;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

/** The legacy `sentinel` with its spinner: the list is not there yet and nothing is cached. */
function RadarLoading() {
  const t = useTranslations();
  return (
    <div data-radar-state="loading" className="grid min-h-[48px] place-items-center">
      <Spinner aria-label={t("feed.loading")} className="size-[22px] border-[2.5px] text-accent" />
    </div>
  );
}

/** The fallback of the route files' `<Suspense>` around `RadarTabServer`: the tab's loading state. */
export function RadarTabFallback() {
  return (
    <div data-route="radars">
      <RadarLoading />
    </div>
  );
}

/** The `renderId`s whose reads the tab's list took, in this launch (module memory: one radar list in the app). */
const adoptedRenders = new Set<string>();

/** Forgets the adopted renders; tests only. */
export function resetAdoptedRenders(): void {
  adoptedRenders.clear();
}

/**
 * A new server render of the tab is adopted once (legacy read the list on every entry of the tab): `useResource`
 * keeps the entry it holds and ignores a second `initial`, and Next keeps the route under `<Activity>`, so the read
 * of a render that entered the tab again (a tab press, WP-29 AM-94) is written over the cached list here; without a
 * server read (header mode) the list is read again through `/bff`, quietly over what is shown. The first render of
 * the launch needs neither (`useResource` seeds or reads by itself), and a `renderId` seen before — Back, the return
 * from a layer, a hidden copy of the tab shown again — changes nothing.
 */
function useAdoptedRender(renderId: string, initial: Radar[] | undefined, list: RadarList): void {
  const { radars, refetch } = list;
  const loaded = radars !== undefined;
  useLayoutEffect(() => {
    if (adoptedRenders.has(renderId)) {
      return;
    }
    const first = adoptedRenders.size === 0;
    adoptedRenders.add(renderId);
    if (initial !== undefined) {
      seedResource(RADARS_PREVIEWS_KEY, initial);
    } else if (!first && loaded) {
      void refetch();
    }
  }, [renderId, initial, loaded, refetch]);
}

/**
 * Pull-to-refresh on the tab (BR-APP-058): reads the list again — the previews come with it — and the indicator spins
 * until it answered. Registered only while the tab shows radars: the "soon" state has no handler, so a pull does
 * nothing there (DEC-51).
 */
function useRadarRefresh(enabled: boolean, list: RadarList): void {
  const current = useRef(list);
  useEffect(() => {
    current.current = list;
  });
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    return registerRefresh(routes.radars(), () => (current.current.status === "idle" ? Promise.resolve() : current.current.refetch()));
  }, [enabled]);
}

/**
 * The radar tab (SCR-026, SCR-027, DEC-51), one request for the whole tab (`GET /radars?include=previews`, BR-APP-063):
 *
 * - soon — radars are switched off: `RadarSoonState` and nothing else; no radar request (`useRadars` stays off) and
 *   no pull handler. Until the reference data reaches the client the server's view (`serverOff`) decides, so the
 *   server HTML and the hydration render agree;
 * - loading — no list and nothing cached: the spinner;
 * - error — the list failed with nothing cached: the tall `ErrorState` («Нет связи» offline, else «Не загрузилось»)
 *   whose «Повторить» reads again;
 * - empty — `RadarEmptyState`;
 * - tiles — `RadarTiles` with the previews of `useRadarPreviews`.
 *
 * A tile tap is a light impact and pushes the radar sheet (it rises: a stored return from a radar's feed is
 * forgotten); its switch is `useRadarSwitch`. Every state keeps the one root `data-route="radars"`.
 */
export function RadarScreen({ initial, renderId, serverOff, flags = devFlags }: RadarScreenProps) {
  const t = useTranslations();
  const { loaded } = useReference();
  const enabled = useRadarsEnabled();
  const soon = loaded ? !enabled : serverOff;
  const list = useRadars({ previews: true, initial, enabled: !soon, flags });
  const finds = useRadarPreviews(list.radars);
  const toggle = useRadarSwitch(flags);
  useAdoptedRender(renderId, initial, list);
  useRadarRefresh(!soon, list);

  const open = (radar: Radar) => {
    tg.haptic.impact();
    clearRadarReturn();
    nav.push(routes.radar(radar.id));
  };

  let body;
  if (soon) {
    body = <RadarSoonState />;
  } else if (list.radars === undefined) {
    const offline = list.error?.error === "offline" || list.error?.error === "timeout";
    body =
      list.status === "error" ? (
        <ErrorState
          tall
          kind={offline ? "offline" : "server"}
          title={offline ? t("error.offline") : t("common.loadFailed")}
          text={offline ? t("error.offlineText") : t("error.serverText")}
          retryLabel={t("error.retry")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <RadarLoading />
      );
  } else if (list.radars.length === 0) {
    body = <RadarEmptyState />;
  } else {
    body = (
      <div className="flex flex-col gap-[14px] px-(--gutter) pt-[4px]">
        <RadarTiles
          radars={list.radars}
          finds={finds}
          flags={flags}
          onOpen={open}
          onToggle={(radar, active) => void toggle(radar, active, { from: "tile" })}
        />
      </div>
    );
  }
  return <div data-route="radars">{body}</div>;
}
