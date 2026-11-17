"use client";

import type { MessageKey } from "@homi/i18n";
import { type SearchFilters, setGeography, toggleDistrict, toggleZone, type Zone, ZONE_OPTIONS } from "@homi/search";
import { FilterChip, Lasso } from "@homi/ui";
import { useTranslations } from "next-intl";

import { ChipRow, Section } from "./Section";
import type { SectionProps } from "./types";

/** The zone chips' texts: the zone enum drives the labels, the city's list only says which zones exist. */
const ZONE_LABELS: Readonly<Record<Zone, MessageKey>> = {
  center: "sheet.zone.center",
  near_center: "sheet.zone.near_center",
};

export interface WhereSectionProps extends SectionProps {
  /**
   * «Обвести на карте» (search mode): receives the draft without districts and zones; the caller saves the city,
   * requests the drawing and goes to the map. Without it the chip is not offered.
   */
  onDraw?: (filters: SearchFilters) => void;
}

/**
 * Section 7 «Где искать» (SCR-014, `LocationSections.jsx:33-131`): exactly one geography mode — a drawn area, zones
 * or districts (BR-APP-008, kept by `setGeography`, `toggleZone`, `toggleDistrict`); «Рядом с метро» is independent.
 *
 * - The area row: in search mode «Обвести на карте» hands the draft to `onDraw`, and with an area the highlighted
 *   «Своя область на карте» removes it; in the radar modes the row exists only with an area, and only removes it.
 * - Zones the city has, in the order `center`, `near_center`, and the metro chip when it has a metro.
 * - Districts with their server names under «Районы области (необязательно):» for a region, «Или районы:» after zone
 *   chips, «Районы:» otherwise.
 *
 * With no city (the reference data not loaded, or a stale code) only the area row is shown.
 */
export function WhereSection({ filters, update, city, mode, onDraw }: WhereSectionProps) {
  const t = useTranslations();
  const hasArea = (filters.polygon?.length ?? 0) > 0;
  const cityZones = new Set((city?.zones ?? []).map((zone) => zone.code));
  const zones = ZONE_OPTIONS.filter((zone) => cityZones.has(zone));
  const metro = city?.has_metro === true;
  const districts = city?.districts ?? [];
  const caption: MessageKey =
    city?.is_region === true ? "sheet.districtsRegion" : zones.length > 0 ? "sheet.orDistricts" : "sheet.districts";
  const offerDraw = mode === "search" && !hasArea && onDraw !== undefined;
  const lasso = <Lasso size={16} aria-hidden />;

  return (
    <Section name="where" title={t("sheet.where")}>
      {hasArea || offerDraw ? (
        <ChipRow>
          {hasArea ? (
            <FilterChip
              pressed
              icon={lasso}
              onClick={() => update(setGeography(filters, { polygon: null }))}
              className="px-[14px]"
            >
              {t("sheet.drawAreaOn")}
            </FilterChip>
          ) : (
            <FilterChip
              icon={lasso}
              onClick={() => onDraw?.(setGeography(filters, { polygon: null }))}
              className="px-[14px]"
            >
              {t("sheet.drawArea")}
            </FilterChip>
          )}
        </ChipRow>
      ) : null}
      {zones.length > 0 || metro ? (
        <ChipRow>
          {zones.map((zone) => (
            <FilterChip
              key={zone}
              pressed={filters.zones.includes(zone)}
              onClick={() => update(toggleZone(filters, zone))}
              className="px-[14px]"
            >
              {t(ZONE_LABELS[zone])}
            </FilterChip>
          ))}
          {metro ? (
            <FilterChip
              pressed={filters.near_metro}
              onClick={() => update({ near_metro: !filters.near_metro })}
              className="px-[14px]"
            >
              {t("sheet.nearMetro")}
            </FilterChip>
          ) : null}
        </ChipRow>
      ) : null}
      {districts.length > 0 ? (
        <>
          <p className="text-[13px] leading-snug text-hint">{t(caption)}</p>
          <ChipRow>
            {districts.map((district) => (
              <FilterChip
                key={district.code}
                pressed={filters.districts.includes(district.code)}
                onClick={() => update(toggleDistrict(filters, district.code))}
                className="px-[14px]"
              >
                {district.name}
              </FilterChip>
            ))}
          </ChipRow>
        </>
      ) : null}
    </Section>
  );
}
