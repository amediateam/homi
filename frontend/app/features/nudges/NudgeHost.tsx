"use client";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { sameFilters, type SearchFilters } from "@homi/search";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { coversSearch, feedListFree, useFreshFeed } from "@/features/feed/fresh";
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
import { ReturnNudge, returnTitle } from "./ReturnNudge";
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
    allowed: feedListFree(pathname, searchParams, status === "ready"),
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
 * (BR-APP-046). The visit tracker also hands the long return to the search feed (`useFreshFeed`, WP-38), with the tab
 * and whether a layer covers the search (`coversSearch`); the fresh pill itself is the top bar's. Seam: the home offer of WP-31 renders last, while `useNudgeSlot().active === "home"`, and names its
 * title in the live line.
 *
 * The live line (`data-nudge-live`, visually hidden) is always in the document and holds the title of the nudge on
 * screen, empty while none is: a polite live region announces only a change inside it, and the card is inserted
 * already filled (the ToastHost rule of WP-23). A suspended nudge that renders again is announced again.
 */
export function NudgeHost({ searchTab, flags = devFlags }: NudgeHostProps) {
  const env = useNudgeEnv(searchTab);
  const slot = useNudgeSlot();
  const pathname = usePathname();
  const searchParams = new URLSearchParams(useSearchParams()?.toString() ?? "");
  const onLongReturn = useFreshFeed({
    searchTab,
    covered: coversSearch(pathname, searchParams),
    view: matchRoute(pathname).route === "map" ? "map" : "list",
  });
  const back = useReturnNudge(env, { searchTab, flags, onLongReturn });
  const follow = useFollowNudge(env, { flags });

  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key, values);

  let nudge: ReactNode = null;
  let title = "";
  if (slot.active === "return" && back.view !== null && rendersIn(env, back.view.filters)) {
    const { view } = back;
    title = returnTitle(view.count, locale, translate);
    nudge = (
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
  } else if (slot.active === "follow" && follow.view !== null && rendersIn(env, follow.view.filters)) {
    const { view } = follow;
    title = t("nudge.title");
    nudge = (
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
  return (
    <>
      <p role="status" aria-live="polite" data-nudge-live="" className="sr-only">
        {title}
      </p>
      {nudge}
    </>
  );
}
