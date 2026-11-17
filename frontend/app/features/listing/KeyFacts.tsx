"use client";

import type { Locale } from "@homi/config";
import { formatNumber } from "@homi/i18n/format";
import { useLocale, useTranslations } from "next-intl";

import type { ListingPreview } from "./listingData";

export interface KeyFactsProps {
  item: Pick<ListingPreview, "rooms" | "area_total" | "floor" | "floors_total">;
  /** `market.code` of the details; the preview has none, so its tiles have no building. */
  marketCode: string | null | undefined;
}

/**
 * The fact tiles under the title (SCR-018 block 4): rooms with their plural, the area in m², the floor `n/total` (or
 * `n` without a total) and the building, «Новый» for the code `new`, «Вторичка» for any other. A tile is left out
 * when its value is unknown; rooms, area and floor also at zero, as the card leaves area and floor out. Nothing at all
 * when no tile is left.
 */
export function KeyFacts({ item, marketCode }: KeyFactsProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const tiles: { fact: string; value: string; label: string }[] = [];
  if (item.rooms) {
    tiles.push({ fact: "rooms", value: formatNumber(item.rooms, locale), label: t("listing.rooms", { n: item.rooms }) });
  }
  if (item.area_total) {
    tiles.push({ fact: "area", value: formatNumber(item.area_total, locale), label: t("listing.m2") });
  }
  if (item.floor) {
    const value = item.floors_total ? `${item.floor}/${item.floors_total}` : String(item.floor);
    tiles.push({ fact: "floor", value, label: t("listing.floor") });
  }
  if (marketCode) {
    const value = marketCode === "new" ? t("listing.newBuilding") : t("listing.secondary");
    tiles.push({ fact: "building", value, label: t("listing.building") });
  }
  if (tiles.length === 0) {
    return null;
  }
  return (
    <ul data-key-facts="" className="grid auto-cols-fr grid-flow-col gap-[8px]">
      {tiles.map((tile) => (
        <li key={tile.fact} data-fact={tile.fact} className="flex min-w-0 flex-col rounded-medium bg-fill px-[10px] py-[10px]">
          <b className="truncate text-[17px] leading-[1.2] font-bold text-text">{tile.value}</b>
          <span className="truncate text-[13px] text-hint">{tile.label}</span>
        </li>
      ))}
    </ul>
  );
}
