"use client";

import { sameFilters, type SearchFilters } from "@homi/search";
import { useSearchParams } from "next/navigation";

import { useRadarsEnabled } from "@/features/radars/capability";
import { useRadars } from "@/features/radars/useRadars";
import { isLayerAddress } from "@/features/shell/shellVariant";
import { usePathname } from "@/i18n/navigation";
import { type DevFlags, devFlags } from "@/lib/flags";
import { matchRoute, parentOf } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useSearchState } from "@/lib/search/useSearchState";
import { useSession } from "@/lib/session/SessionProvider";
import { useToast } from "@/lib/ui/toast";

import { FollowNudge } from "./FollowNudge";
import { ReturnNudge } from "./ReturnNudge";
import { type NudgeEnv, useNudgeSlot } from "./store";
import { useFollowNudge } from "./useFollowNudge";
import { useReturnNudge } from "./useReturnNudge";

/**
 * What the host sees (`NudgeEnv`). `nudgesAllowed` (BR-APP-046) is the feed list — `/` without a layer parameter, the
 * same test as the shell's collapsing chrome — with a ready session; the new-radar sheet, every other sheet and the
 * listing have addresses of their own, so no nudge shows over them. The filters are the address's while it is a
 * search root (`/`, `/map`): elsewhere it carries no search, and a nudge is only suspended there. The plain radar list
 * is read on the search tab only (legacy read it there), so the radar tab still sends one request.
 */
export function useNudgeEnv(searchTab: boolean): NudgeEnv {
  const pathname = usePathname();
  const searchParams = new URLSearchParams(useSearchParams()?.toString() ?? "");
  const { status } = useSession();
  const { filters } = useSearchState();
  const toast = useToast("app") !== null;
  const radarsEnabled = useRadarsEnabled();
  const { loaded, radarLimit } = useReference();
  const { radars } = useRadars({ enabled: searchTab });

  const route = matchRoute(pathname).route;
  const searchRoot = route === "feed" || route === "map";
  const layerParam = searchRoot && parentOf(pathname, searchParams) !== null;
  return {
    allowed: route === "feed" && !layerParam && status === "ready",
    layer: isLayerAddress(pathname) || layerParam,
    filters: searchRoot ? filters : null,
    toast,
    radars,
    radarsEnabled,
    limit: radarLimit,
    referenceLoaded: loaded,
  };
}

/**
 * Whether a nudge of `filters` that holds the slot renders now: on the feed list, with no toast, while the address
 * still has its filters. Otherwise it is suspended — not rendered, no event — and renders again, with its timer
 * started afresh, once the feed list shows the same filters without a toast.
 */
export function rendersIn(env: NudgeEnv, filters: SearchFilters): boolean {
  return env.allowed && !env.toast && env.filters !== null && sameFilters(env.filters, filters);
}

export interface NudgeHostProps {
  /** The shell's active tab is the search tab (list, map or a layer over them). */
  searchTab: boolean;
  /** The app's flags; tests pass overrides. */
  flags?: DevFlags;
}

/**
 * The nudges above the tab bar (WP-30, `03` §3.6 z 35), mounted once by `AppShell`: at most one on screen, the one
 * that holds the slot of `store.ts` — return banner > follow nudge > home offer (fix of LB-APP-049). Each nudge's hook
 * gets the host's `env` and decides when its nudge takes the slot; the host renders the holder while `rendersIn`.
 *
 * The return banner's hook comes first, so its effects — the search visits among them (`useSearchVisits`) — run before
 * the follow nudge's: a return check of the applied filters is pending before the follow nudge's wait could start
 * (BR-APP-046). Seam: the home offer of WP-31 renders last, while `useNudgeSlot().active === "home"`.
 */
export function NudgeHost({ searchTab, flags = devFlags }: NudgeHostProps) {
  const env = useNudgeEnv(searchTab);
  const slot = useNudgeSlot();
  const back = useReturnNudge(env, { searchTab, flags });
  const follow = useFollowNudge(env, { flags });

  if (slot.active === "return" && back.view !== null && rendersIn(env, back.view.filters)) {
    const { view } = back;
    return (
      <ReturnNudge
        key={view.id}
        filters={view.filters}
        count={view.count}
        onShown={back.markShown}
        onExpire={back.expire}
        onClose={back.close}
        onEnable={back.enable}
        flags={flags}
      />
    );
  }
  if (slot.active === "follow" && follow.view !== null && rendersIn(env, follow.view.filters)) {
    const { view } = follow;
    return (
      <FollowNudge
        key={view.id}
        filters={view.filters}
        flow={view.flow}
        onShown={follow.markShown}
        onExpire={follow.expire}
        onClose={follow.close}
        onEnable={follow.enable}
        flags={flags}
      />
    );
  }
  return null;
}
