"use client";

import type { MessageKey } from "@homi/i18n";
import { countActiveFilters, NO_ROOMS_TYPES, type Owner, priceLabel, roomsLabel, type Translate } from "@homi/search";
import { ArrowUpDown, ChevronDown, HeaderChip, Lasso, MapPin, SlidersHorizontal } from "@homi/ui";
import { useTranslations } from "next-intl";

import { labelFor } from "@/i18n/labels";
import { useMoney } from "@/lib/money/useMoney";
import { nav } from "@/lib/navigation/nav";
import { type QuickFilterKind, routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { tg } from "@/lib/telegram";

/**
 * The owner chip's label: «Кто размещает» while every owner is shown — not highlighted, the fix of LB-APP-042
 * (legacy read «Без риелторов» there as if the filter were set) — else the chosen value.
 */
const OWNER_LABELS: Readonly<Record<Owner, MessageKey>> = {
  any: "sheet.who",
  no_agents: "owner.no_agents",
  owners: "owner.owners",
};

function ownerLabel(owner: string): MessageKey {
  return Object.hasOwn(OWNER_LABELS, owner) ? OWNER_LABELS[owner as Owner] : OWNER_LABELS.any;
}

/** Legacy `hchip` padding and gap in pixels: the primitive's rem values are 6.25 % small under the 15 px root (KI-33). */
const CHIP = "gap-[6px] px-[14px]";

/**
 * The «⌄» after an unset rooms or price label (legacy `FeedHeader.jsx`). It sits in the chip's label, so it is drawn
 * inline after the text, the chip's 6 px gap away.
 */
const PICKER = <ChevronDown size={14} aria-hidden className="ml-[6px] inline align-[-2px]" />;

/**
 * The chips of the search list (SCR-007, legacy `hchips`), in the `chips` region of the top bar, in one row that
 * scrolls sideways: filters with the number of active groups (BR-APP-011), the sort, «Своя область» with a drawn
 * area, rooms (not for a search of rooms, commercial or land only, BR-APP-006), price, owner, and the city when the
 * reference data has more than one. A tap plays a light impact and pushes the chip's sheet with the search state;
 * «Своя область» switches to the map as the view toggle does. The state is the feed's own (`useScreenSearchState`),
 * so the row kept under a listing or a sheet shows the list below it.
 */
export function FeedHeader() {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key as never, values as never);
  const { filters, sort, href } = useScreenSearchState("feed");
  const { cities, findCity } = useReference();
  const money = useMoney();

  const active = countActiveFilters(filters);
  const hasArea = (filters.polygon?.length ?? 0) > 0;
  const rooms = roomsLabel(filters, { t: translate });
  const price = priceLabel(filters, { t: translate, formatPrice: money.format });
  const showRooms = !filters.types.every((type) => NO_ROOMS_TYPES.has(type));
  const sortLabel = t(labelFor("sort", sort));
  const city = cities.length > 1 ? (findCity(filters.city)?.name ?? "") : null;

  const open = (to: string) => {
    tg.haptic.impact();
    nav.push(to);
  };
  const quick = (kind: QuickFilterKind) => open(href((params) => routes.quickFilter(kind, params)));

  return (
    <div
      data-slot="feed-header"
      data-scroll-x=""
      className="-mx-(--gutter) mt-[10px] flex gap-[8px] overflow-x-auto overscroll-x-contain px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <HeaderChip
        data-chip="filters"
        aria-label={active > 0 ? `${t("sheet.title")}, ${active}` : t("sheet.title")}
        count={active}
        icon={<SlidersHorizontal size={17} aria-hidden />}
        onClick={() => open(href(routes.filters))}
        className={CHIP}
      />
      <HeaderChip
        data-chip="sort"
        aria-label={`${t("sort.title")}, ${sortLabel}`}
        icon={<ArrowUpDown size={15} aria-hidden />}
        onClick={() => open(href(routes.sort))}
        className={CHIP}
      >
        {sortLabel}
      </HeaderChip>
      {hasArea ? (
        <HeaderChip
          data-chip="area"
          highlighted
          icon={<Lasso size={15} aria-hidden />}
          onClick={() => {
            tg.haptic.impact();
            nav.tab(href(routes.map));
          }}
          className={CHIP}
        >
          {t("map.areaOn")}
        </HeaderChip>
      ) : null}
      {showRooms ? (
        <HeaderChip
          data-chip="rooms"
          highlighted={rooms !== null}
          title={rooms ?? t("head.rooms")}
          onClick={() => quick("rooms")}
          className={CHIP}
        >
          {rooms ?? (
            <>
              {t("head.rooms")}
              {PICKER}
            </>
          )}
        </HeaderChip>
      ) : null}
      <HeaderChip
        data-chip="price"
        highlighted={price !== null}
        title={price ?? t("head.price")}
        onClick={() => quick("price")}
        className={CHIP}
      >
        {price ?? (
          <>
            {t("head.price")}
            {PICKER}
          </>
        )}
      </HeaderChip>
      <HeaderChip
        data-chip="owner"
        highlighted={filters.owner !== "any"}
        onClick={() => quick("owner")}
        className={CHIP}
      >
        {t(ownerLabel(filters.owner))}
      </HeaderChip>
      {city !== null ? (
        <HeaderChip
          data-chip="city"
          aria-label={city ? undefined : t("city.title")}
          icon={<MapPin size={15} aria-hidden />}
          onClick={() => open(href(routes.city))}
          className={CHIP}
        >
          {city}
        </HeaderChip>
      ) : null}
    </div>
  );
}
