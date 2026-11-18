"use client";

import { type BaseDeal, baseDeal, countActiveFilters, normalizeSort, sortOptions, switchDeal } from "@homi/search";
import { Button, cn, HeaderChip, Lasso, Plus, SegmentedControl, SlidersHorizontal, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, ReactNode } from "react";

import { FeedHeader } from "@/features/feed/FeedHeader";
import { useRadarsEnabled } from "@/features/radars/capability";
import { Link, usePathname } from "@/i18n/navigation";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { useReference } from "@/lib/reference/useReference";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { type SearchStateApi, useSearchState } from "@/lib/search/useSearchState";
import { tg } from "@/lib/telegram";
import { lastSearchQuery, setAreaTooSmall, useAreaTooSmall } from "@/lib/ui/shellState";

import type { ShellVariant } from "./shellVariant";

/** The two deals of the switch; daily rent counts as rent (`baseDeal`). */
const DEALS: readonly BaseDeal[] = ["rent_long", "sale"];

/** The title of a tab: legacy `screen-title` and `title-tab`. */
const TITLE = "text-[28px] font-bold tracking-[-0.03em]";

/**
 * A round glass button of the map bar (legacy `icon-round`, 44 px) on the `HeaderChip` primitive, its badge moved to
 * the corner (legacy `dot-badge`). `.glass` is unlayered CSS and would win over the highlighted colours, so a
 * highlighted button goes without it. Legacy sizes are pixels: the spacing scale is in rem and the root is 15 px, so
 * the shell spells them out.
 */
const ROUND =
  "relative h-[44px] w-[44px] justify-center rounded-pill border-0 px-0 [&>[data-slot=header-chip-badge]]:absolute [&>[data-slot=header-chip-badge]]:-top-[3px] [&>[data-slot=header-chip-badge]]:-right-[3px]";

type TitleTab<T extends string> = { value: T; label: string };

/** The arrow keys of a radio group: right and down move to the next option, left and up to the previous one. */
const ARROW_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Title tabs (legacy `title-tabs`): the deal of the search list and the two lists of the saved tab. A tap on the
 * selected tab does nothing, as the segmented control of the map. `current` names the selected tab for assistive
 * technology. The deal is a radio group, as the map's control is: one option is always checked, only the checked one
 * is in the Tab order, and the arrow keys move the focus and the choice. The saved lists are two addresses, so the
 * selected one is the current page.
 */
function TitleTabs<T extends string>({
  tabs,
  value,
  onSelect,
  current,
}: {
  tabs: readonly TitleTab<T>[];
  value: T;
  onSelect: (value: T) => void;
  current: "radio" | "page";
}) {
  const radio = current === "radio";
  const onArrow = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = ARROW_STEP[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[data-slot="title-tab"]')[next]?.focus();
    if (tabs[next].value !== value) {
      onSelect(tabs[next].value);
    }
  };
  return (
    <div data-slot="title-tabs" role={radio ? "radiogroup" : undefined} className="flex items-baseline gap-[18px] py-[2px]">
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            data-slot="title-tab"
            data-state={selected ? "on" : "off"}
            role={radio ? "radio" : undefined}
            aria-checked={radio ? selected : undefined}
            tabIndex={radio && !selected ? -1 : undefined}
            aria-current={!radio && selected ? "page" : undefined}
            onKeyDown={radio ? (event) => onArrow(event, index) : undefined}
            onClick={() => {
              if (!selected) {
                onSelect(tab.value);
              }
            }}
            className={cn(
              TITLE,
              "min-w-0 truncate rounded-small transition-[color,opacity] duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "text-text" : "text-hint opacity-55",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The rent / sale switch of the title tabs and the map control: `switchDeal()` (the new deal's defaults, geography
 * kept, BR-APP-002) and the sort it still offers (BR-APP-023) in one write, a light haptic, and the list back at the
 * top. Before the reference data arrives the city is unknown, so only the three basic sorts survive. The selected
 * deal never reaches here: both controls ignore a tap on it.
 */
function useDealSwitch(state: SearchStateApi): { deal: BaseDeal; pick: (deal: BaseDeal) => void } {
  const { findCity } = useReference();
  const { filters, sort, write } = state;
  const deal = baseDeal(filters.deal);
  return {
    deal,
    pick: (next) => {
      if (next === deal) {
        return;
      }
      const switched = switchDeal(filters, next);
      tg.haptic.impact();
      write(switched, normalizeSort(sort, sortOptions(switched, findCity(switched.city))));
      window.scrollTo(0, 0);
    },
  };
}

function useDealTabs(): readonly TitleTab<BaseDeal>[] {
  const t = useTranslations();
  return DEALS.map((deal) => ({ value: deal, label: t(`deal.${deal}`) }));
}

/**
 * Search list: the deal as title tabs, and the `chips` region with `FeedHeader` (WP-24). Both read the feed's own
 * search state (`useScreenSearchState`, KI-43), so the bar kept under a listing or a sheet shows the list below it.
 */
function SearchListBar() {
  const tabs = useDealTabs();
  const { deal, pick } = useDealSwitch(useScreenSearchState("feed"));
  return (
    <>
      <TitleTabs tabs={tabs} value={deal} onSelect={pick} current="radio" />
      <div data-topbar-chips="">
        <FeedHeader />
      </div>
    </>
  );
}

/**
 * Map: the compact deal control, the lasso (highlighted while an area is drawn) and the filters with their badge,
 * whose count is also in the button's name (the badge itself is decorative). Below 346 px (a 320 px phone) the deal
 * control gives up width so the round buttons stay on the screen.
 */
function MapBar() {
  const t = useTranslations();
  const state = useSearchState();
  const { filters, sort, write, href } = state;
  const { deal, pick } = useDealSwitch(state);
  const tabs = useDealTabs();
  const hasArea = (filters.polygon?.length ?? 0) > 0;
  const active = countActiveFilters(filters);

  const startDrawing = () => {
    tg.haptic.impact();
    setAreaTooSmall(false);
    nav.push(
      href((params) => {
        params.set("draw", "1");
        return routes.map(params);
      }),
    );
  };
  const openFilters = () =>
    nav.push(
      href((params) => {
        params.set("from", "map");
        return routes.filters(params);
      }),
    );
  const clearArea = () => {
    tg.haptic.impact();
    write({ ...filters, polygon: null }, sort);
  };

  return (
    <>
      <div data-slot="map-bar" className="pointer-events-auto flex items-center gap-[8px]">
        <SegmentedControl
          size="compact"
          options={tabs}
          value={deal}
          onValueChange={pick}
          className="min-w-0 flex-[0_1_210px]"
        />
        <HeaderChip
          aria-label={t("map.area")}
          highlighted={hasArea}
          icon={<Lasso size={18} />}
          onClick={startDrawing}
          className={cn(ROUND, "ml-auto", !hasArea && "glass")}
        />
        <HeaderChip
          aria-label={active > 0 ? `${t("sheet.title")}, ${active}` : t("sheet.title")}
          count={active}
          icon={<SlidersHorizontal size={18} />}
          onClick={openFilters}
          className={cn(ROUND, "glass")}
        />
      </div>
      {hasArea ? (
        <div
          data-slot="area-pill"
          className="glass pointer-events-auto mx-auto mt-[8px] flex h-[36px] w-max items-center rounded-pill pr-[4px]"
        >
          <button
            type="button"
            onClick={startDrawing}
            className="inline-flex h-[36px] items-center gap-[6px] pr-[8px] pl-[14px] text-[13px] font-semibold text-text outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Lasso size={15} />
            {t("map.areaOn")}
          </button>
          <button
            type="button"
            aria-label={t("map.areaRemove")}
            onClick={clearArea}
            className="grid size-[30px] place-items-center rounded-pill text-text outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:bg-fill"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Drawing (the `draw=1` layer of the map, WP-28): the hint, «Обведите покрупнее» after a too-small stroke (WP-28 sets
 * it), and «Отмена», which closes the layer through Back. The hint and the sub-hint keep one line each in the 44 px
 * pill and end in an ellipsis, as legacy `draw-hint`.
 */
function DrawingBar() {
  const t = useTranslations();
  const tooSmall = useAreaTooSmall();
  const { back } = useBack();
  return (
    <div data-slot="draw-bar" className="pointer-events-auto flex items-center justify-center gap-[8px]">
      <div
        role="status"
        className="glass flex h-[44px] min-w-0 flex-1 flex-col justify-center rounded-pill px-[16px] text-[14px] leading-[1.2] font-semibold text-text"
      >
        <span className="truncate">{t(tooSmall ? "map.areaSmall" : "map.areaHint")}</span>
        <span className="truncate text-[12px] font-medium text-hint">{t("map.areaMove")}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          tg.haptic.impact();
          back();
        }}
        className="glass h-[44px] flex-none rounded-pill px-[16px] text-[14px] font-semibold text-text outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("map.areaCancel")}
      </button>
    </div>
  );
}

/** Saved: favourites and history as title tabs; a tap replaces the address. */
function SavedBar() {
  const t = useTranslations();
  const history = matchRoute(usePathname()).route === "history";
  return (
    <TitleTabs
      tabs={[
        { value: "favorites", label: t("app.saved.favorites") },
        { value: "history", label: t("app.saved.history") },
      ]}
      value={history ? "history" : "favorites"}
      onSelect={(tab) => {
        tg.haptic.impact();
        nav.replace(tab === "history" ? routes.history() : routes.saved());
      }}
      current="page"
    />
  );
}

/**
 * Radar: the title and «+» (SCR-026). «+» pushes the new-radar sheet with the search keys of the last search
 * (`lastSearchQuery`, D-SH-4) after a light impact, in every state of the tab and at the radar limit too (legacy);
 * without an `entry` the sheet creates with `empty`. It is not rendered while radars are switched off
 * (`useRadarsEnabled()`, DEC-51), nor before the reference data says they are on; the title stays.
 */
function RadarsBar() {
  const t = useTranslations();
  const radarsEnabled = useRadarsEnabled();
  return (
    <ScreenHead title={t("tab.subs")}>
      {radarsEnabled ? (
        <Button asChild variant="secondary" size="icon">
          <Link
            href={routes.radarNew(lastSearchQuery())}
            aria-label={t("sheet.createTitle")}
            onClick={() => tg.haptic.impact()}
          >
            <Plus size={20} />
          </Link>
        </Button>
      ) : null}
    </ScreenHead>
  );
}

function ScreenHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div data-slot="screen-head" className="flex items-center justify-between gap-[12px]">
      <h1 className={cn(TITLE, "min-w-0 truncate py-[2px]")}>{title}</h1>
      {children}
    </div>
  );
}

function SettingsBar() {
  const t = useTranslations();
  return <ScreenHead title={t("tab.settings")} />;
}

const BARS: Readonly<Record<Exclude<ShellVariant, "none">, () => ReactNode>> = {
  "search-list": SearchListBar,
  map: MapBar,
  "map-drawing": DrawingBar,
  saved: SavedBar,
  radars: RadarsBar,
  settings: SettingsBar,
};

/**
 * The top bar of the shell (SCR-006, legacy `header.topbar`). It holds no data: the search variants read the address
 * through `useSearchState()` (the list through the feed's own state of `useScreenSearchState`) and write it back; the
 * others are titles. Over the map it is a transparent layer whose
 * controls float; elsewhere it is sticky glass that slides away while the chrome is collapsed (`html.chrome-mini`,
 * search list only). `none` (a listing loaded directly, a gate) renders nothing.
 */
export function TopBar({ variant }: { variant: ShellVariant }) {
  if (variant === "none") {
    return null;
  }
  const Bar = BARS[variant];
  const overMap = variant === "map" || variant === "map-drawing";
  return (
    <header
      data-topbar={variant}
      data-chrome=""
      className={cn(
        "top-0 z-(--z-topbar) px-(--gutter) pt-[calc(8px+var(--top-inset))] pb-[10px]",
        overMap ? "pointer-events-none fixed inset-x-0" : "glass sticky",
      )}
    >
      <div className="mx-auto max-w-(--feed-max)">
        <Bar />
      </div>
    </header>
  );
}
