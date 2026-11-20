"use client";

import { baseDeal, filtersSummary, type Translate } from "@homi/search";
import { useTranslations } from "next-intl";

import { useMoney } from "@/lib/money/useMoney";
import { useReference } from "@/lib/reference/useReference";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";

import { expandChrome } from "./useMiniChrome";

/**
 * The summary the collapsed title prints (BR-APP-064), chosen here only. It is `filtersSummary` as WP-22
 * ships it, which names the city by its plain name; the whole-city label «{city} целиком» of LB-APP-026 (DEC-54) is
 * `filtersAreaSummary`'s, and whether the mini title takes it is still open for the reviewer.
 */
export const miniTitleSummary = filtersSummary;

/**
 * The one-line title of the collapsed chrome (SCR-006, legacy `mini-top`), search list only: «<deal> · <summary>»,
 * the deal being the base deal of the title tabs. Daily rent prints the summary alone, which already names
 * «Посуточно» (DEC-66, legacy since `index-CIa0Ldj2.js`). Until the reference data arrives the summary waits (it
 * names the city and its districts) and the title is the deal alone. It shows only under `html.chrome-mini` and never in lite graphics (`[data-mini-title]` in
 * `lite.css`); in Telegram's full-screen mode it sits in the header row (`styles/shell.css`). A tap only expands. It
 * names the feed's own search (`useScreenSearchState`, KI-43), also while a listing or a sheet lies over the feed.
 */
export function MiniTitle() {
  const t = useTranslations();
  const { filters } = useScreenSearchState("feed");
  const { loaded, cities } = useReference();
  const money = useMoney();
  const deal = t(`deal.${baseDeal(filters.deal)}`);
  const translate: Translate = (key, values) => t(key as never, values as never);
  const summary = loaded ? miniTitleSummary(filters, { t: translate, formatPrice: money.format, cities }) : "";
  return (
    <button
      type="button"
      data-mini-title=""
      onClick={() => expandChrome()}
      className="glass fixed top-[calc(var(--top-inset)+8px)] left-1/2 z-(--z-mini-title) h-[36px] max-w-[calc(100%-96px)] truncate rounded-pill px-[16px] text-[14px] font-semibold text-text outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {summary ? (filters.deal === "rent_daily" ? summary : `${deal} · ${summary}`) : deal}
    </button>
  );
}
