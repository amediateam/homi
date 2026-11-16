"use client";

import type { MessageKey } from "@homi/i18n";
import { cn, Heart, type LucideIcon, RadarIcon, Search, Settings } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type CSSProperties, useLayoutEffect, useRef } from "react";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";
import { lastSavedHref, lastSearchHref } from "@/lib/ui/shellState";

import type { ShellTab } from "./shellVariant";
import { expandChrome } from "./useMiniChrome";

/** Legacy shrinks a label longer than this (some uz and en texts) with the `long` class. */
export const LONG_LABEL_CHARS = 13;

const TABS: readonly { key: ShellTab; label: MessageKey; Icon: LucideIcon; href: () => string }[] = [
  { key: "search", label: "tab.search", Icon: Search, href: lastSearchHref },
  { key: "saved", label: "tab.favorites", Icon: Heart, href: lastSavedHref },
  { key: "radars", label: "tab.subs", Icon: RadarIcon, href: routes.radars },
  { key: "settings", label: "tab.settings", Icon: Settings, href: routes.settings },
];

/**
 * The tab bar (WP-23, SCR-006, legacy `nav.tabbar.glass`): four tabs with their icons at 24 px over a glass pill, the
 * lens under the active one placed by `--tab` (its index; `styles/shell.css` moves it). A press on collapsed chrome
 * only expands it (`expandChrome`). Otherwise a press is a light impact (TMA-025), a replace to the tab's address that
 * clears the history stack (`nav.tab`) — search returns to the last list or map with its filters, saved to the last of
 * favourites and history — and a scroll to the top; on the active tab it only scrolls. The replace is a transition
 * that keeps the old tab on screen until the new one arrives, so the scroll waits for the new tab: it runs in the
 * commit that makes it active, before the paint, and the old tab never jumps to its top. Collapsed
 * (`html.chrome-mini`), the bar shrinks to a circle around the active tab's icon; under lite graphics it slides away
 * instead.
 */
export function TabBar({ active }: { active: ShellTab }) {
  const t = useTranslations();
  const scrollOnArrival = useRef(false);

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
    tg.haptic.impact();
    if (key === active) {
      window.scrollTo(0, 0);
      return;
    }
    scrollOnArrival.current = true;
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
                current ? "font-bold" : "font-semibold opacity-55 active:opacity-80",
              )}
            >
              <Icon size={24} strokeWidth={current ? 2.2 : 1.7} />
              <span className={text.length > LONG_LABEL_CHARS ? "long" : undefined}>{text}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
