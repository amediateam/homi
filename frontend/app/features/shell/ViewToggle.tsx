"use client";

import { List, MapIcon } from "@homi/ui";
import { useTranslations } from "next-intl";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useSearchState } from "@/lib/search/useSearchState";
import { tg } from "@/lib/telegram";

import type { ShellVariant } from "./shellVariant";
import { expandChrome } from "./useMiniChrome";

/**
 * The floating list / map switch (SCR-006, legacy `view-toggle`): it names the view it switches to — «Карта» on the
 * list, «Список» on the map — and carries the search state there with `nav.tab`, the replace of the tab bar. Search
 * tab only and hidden while drawing (`map-drawing`). While the chrome is collapsed the first tap only expands it
 * (`expandChrome` plays the haptic); the collapse morph is in `styles/shell.css`.
 */
export function ViewToggle({ variant }: { variant: ShellVariant }) {
  const t = useTranslations();
  const { href } = useSearchState();
  if (variant !== "search-list" && variant !== "map") {
    return null;
  }
  const toMap = variant === "search-list";
  const Icon = toMap ? MapIcon : List;
  return (
    <button
      type="button"
      data-view-toggle={toMap ? "list" : "map"}
      data-chrome=""
      onClick={() => {
        if (expandChrome()) {
          return;
        }
        tg.haptic.impact();
        nav.tab(href(toMap ? routes.map : routes.feed));
      }}
      className="glass fixed bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+22px)] left-1/2 z-(--z-view-toggle) inline-flex h-[44px] items-center gap-[8px] rounded-[22px] px-[18px] text-[15px] font-semibold text-text outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon size={18} />
      <span data-slot="view-toggle-label">{t(toMap ? "app.view.map" : "app.view.list")}</span>
    </button>
  );
}
