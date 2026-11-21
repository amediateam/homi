"use client";

import type { MessageKey } from "@homi/i18n";
import { cn, Heart, type LucideIcon, RadarIcon, Search, Settings } from "@homi/ui";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react";

import { forgetFeedScroll, hasFeedScroll } from "@/features/feed/feedScroll";
import { useOwnerPending } from "@/features/owner/pending";
import { trackAttention } from "@/features/owner/signals/attention";
import { clearRadarReturn } from "@/features/radars/radarReturn";
import { usePathname } from "@/i18n/navigation";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";
import { lastSavedHref, lastSearchHref, rememberHref } from "@/lib/ui/shellState";

import type { ShellTab } from "./shellVariant";

import { expandChrome } from "./useMiniChrome";

/** Legacy shrinks a label longer than this (some uz and en texts) with the `long` class. */
export const LONG_LABEL_CHARS = 13;

/**
 * The address of a radar's feed as the search: a search root (`/`, `/map`) whose query has `from=radar`, without that
 * mark; `null` for any other address.
 */
export function radarFeedAsSearch(pathname: string, query: string): string | null {
  const { route } = matchRoute(pathname);
  const params = new URLSearchParams(query);
  if ((route !== "feed" && route !== "map") || params.get("from") !== "radar") {
    return null;
  }
  params.delete("from");
  return route === "feed" ? routes.feed(params) : routes.map(params);
}

const TABS: readonly { key: ShellTab; label: MessageKey; Icon: LucideIcon; href: () => string }[] = [
  { key: "search", label: "tab.search", Icon: Search, href: lastSearchHref },
  { key: "saved", label: "tab.favorites", Icon: Heart, href: lastSavedHref },
  { key: "radars", label: "tab.subs", Icon: RadarIcon, href: routes.radars },
  { key: "settings", label: "tab.settings", Icon: Settings, href: routes.settings },
];

/**
 * The tab bar (WP-23, SCR-006, legacy `nav.tabbar.glass`): four tabs with their icons at 24 px over a glass pill, the
 * lens under the active one placed by `--tab` (its index; `styles/shell.css` moves it and tints an inactive tab with
 * the text colour at 55 %). A press on collapsed chrome
 * only expands it (`expandChrome`). Otherwise a press is a light impact (TMA-025), a replace to the tab's address that
 * clears the history stack (`nav.tab`) — search returns to the last list or map with its filters, saved to the last of
 * favourites and history — and a scroll to the top; on the active tab it only scrolls, and forgets the search list's
 * scroll memory (WP-38, BR-APP-105). The replace is a transition that keeps the old tab on screen until the new one
 * arrives, so the scroll waits for the new tab: it runs in the commit that makes it active, before the paint, and the
 * old tab never jumps to its top. On arrival at the search tab with a remembered list position the scroll is the
 * list's own (`FeedScreen` restores it, or goes to the top for another list). Collapsed
 * (`html.chrome-mini`), the bar shrinks to a circle around the active tab's icon; under lite graphics it slides away
 * instead.
 *
 * A radar's feed («Смотреть найденное», a search root with `from=radar`, WP-30) is not the user's search until a tab
 * press makes it so (legacy `switchTab` ended the radar return): a press on the search tab there replaces the address
 * with the same one without `from` and clears the stack, so Back no longer reopens the radar sheet and the shell
 * remembers it as the search (`rememberHref`); a press on another tab remembers it first, so the search tab returns
 * to the radar's filters. Every press forgets a stored radar return (`clearRadarReturn`).
 */
export function TabBar({ active }: { active: ShellTab }) {
  const t = useTranslations();
  // The red dot of the Settings tab while requests wait (WP-82, SCR-060), and its `owner_attention` pair.
  const { pending } = useOwnerPending();
  useEffect(() => {
    if (pending > 0) {
      trackAttention("dot", "shown");
    }
  }, [pending]);
  const scrollOnArrival = useRef(false);
  const radarFeed = radarFeedAsSearch(usePathname(), useSearchParams()?.toString() ?? "");

  useLayoutEffect(() => {
    if (scrollOnArrival.current) {
      scrollOnArrival.current = false;
      window.scrollTo(0, 0);
    }
  }, [active]);

  const press = (key: ShellTab, href: () => string) => {
    if (expandChrome()) {
      return;
    }
    if (key === "settings" && pending > 0) {
      trackAttention("dot", "clicked");
    }
    tg.haptic.impact();
    clearRadarReturn();
    if (key === active) {
      if (radarFeed !== null) {
        nav.tab(radarFeed);
      }
      forgetFeedScroll();
      window.scrollTo(0, 0);
      return;
    }
    if (radarFeed !== null) {
      const [path, query = ""] = radarFeed.split("?");
      rememberHref(path, query);
    }
    // Decided at the press: the list's own layout effect runs before this bar's in the arrival commit and takes the
    // memory, so the bar must not scroll over the position it restores.
    scrollOnArrival.current = !(key === "search" && hasFeedScroll());
    nav.tab(href());
  };

  return (
    <>
      <span data-mini-ring="" aria-hidden />
      <nav
        data-tabbar=""
        data-chrome=""
        className="glass fixed bottom-[calc(10px+var(--bottom-inset))] z-(--z-tabbar) grid h-(--tabbar-h) grid-cols-4 rounded-pill p-[5px] shadow-(--shadow-float)"
        style={{ "--tab": TABS.findIndex((tab) => tab.key === active) } as CSSProperties}
      >
        <span data-tab-lens="" aria-hidden />
        {TABS.map(({ key, label, Icon, href }) => {
          const current = key === active;
          const text = t(label);
          return (
            <button
              key={key}
              type="button"
              data-tab={key}
              aria-current={current ? "page" : undefined}
              onClick={() => press(key, href)}
              className={cn(
                "relative z-1 flex min-w-0 flex-col items-center justify-center gap-px text-[11px] text-text active:scale-92",
                current ? "font-bold" : "font-semibold active:opacity-80",
              )}
            >
              <Icon size={24} strokeWidth={current ? 2.2 : 1.7} />
              {key === "settings" && pending > 0 ? (
                <>
                  <span data-tab-dot={pending} aria-hidden className="absolute top-[6px] left-[calc(50%+6px)] size-[9px] rounded-full bg-danger ring-2 ring-bg" />
                  <span className="sr-only">{t("own.pendingShort", { n: pending })}</span>
                </>
              ) : null}
              <span className={text.length > LONG_LABEL_CHARS ? "long" : undefined}>{text}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
