"use client";

import { List, MapIcon } from "@homi/ui";
import { useTranslations } from "next-intl";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { tg } from "@/lib/telegram";
import { useBottomMark } from "@/lib/ui/shellState";

import type { ShellVariant } from "./shellVariant";
import { expandChrome } from "./useMiniChrome";

/**
 * The floating list / map switch (SCR-006, legacy `view-toggle`): it names the view it switches to — «Карта» on the
 * list, «Список» on the map — and carries the search state of its own view there with `nav.tab`, the replace of the
 * tab bar: the list's or the map's (`useScreenSearchState`, KI-43), so the toggle kept under a listing keeps the search
 * of the view below it. Search tab only and hidden while drawing (`map-drawing`). While the chrome is collapsed the
 * first tap only expands it (`expandChrome` plays the haptic); the collapse morph is in `styles/shell.css`. A
 * pointer-down on «Карта» calls `onIntent` at once, also on the collapsed chrome: the shell warms the map's code with it
 * (WP-27, LB-APP-018).
 */
export function ViewToggle({ variant, onIntent }: { variant: ShellVariant; onIntent?: () => void }) {
  const t = useTranslations();
  const { href } = useScreenSearchState(variant === "map" ? "map" : "feed");
  const shown = variant === "search-list" || variant === "map";
  useBottomMark("toggle", shown);
  if (!shown) {
    return null;
  }
  const toMap = variant === "search-list";
  const Icon = toMap ? MapIcon : List;
  return (
    <button
      type="button"
      data-view-toggle={toMap ? "list" : "map"}
      data-chrome=""
      onPointerDown={toMap && onIntent ? () => onIntent() : undefined}
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
