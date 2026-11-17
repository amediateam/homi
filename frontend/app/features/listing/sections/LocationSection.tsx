"use client";

import type { Locale } from "@homi/config";
import { formatCenter, type Translate } from "@homi/i18n/format";
import { useLocale, useTranslations } from "next-intl";

import type { ListingDetails } from "../listingData";
import { NearbySection, nearbyRows } from "./NearbySection";
import { SpotMapSlot } from "./SpotMapSlot";

/**
 * «Расположение» (`03` SCR-018, block 9): with coordinates the spot map slot and the hint that the place is
 * approximate; the place line («district · landmark», `placeLine` of the caller); the distance to the centre; then
 * «Рядом». The heading stays while any of them is there, also when «Рядом» is empty (legacy); nothing at all → no
 * section.
 */
export function LocationSection({
  number,
  details,
  place,
}: {
  number: number;
  details: Pick<ListingDetails, "location" | "center_km" | "metro" | "nearby" | "geo_radius_m">;
  place: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  const center = formatCenter(details.center_km, locale, translate);
  const hasNearby = nearbyRows(details.metro, details.nearby).length > 0;
  if (details.location === null && !place && center === null && !hasNearby) {
    return null;
  }

  return (
    <section data-section="location" className="flex flex-col gap-[10px] px-(--gutter) py-[12px]">
      <h2 className="text-[17px] font-bold">{t("listing.location")}</h2>
      {details.location !== null ? (
        <>
          <SpotMapSlot number={number} />
          <p className="text-[13px] leading-snug text-hint">{t("listing.mapApprox")}</p>
        </>
      ) : null}
      {place || center !== null ? (
        <div className="flex flex-col gap-[2px]">
          {place ? <p data-location-place="">{place}</p> : null}
          {center !== null ? (
            <p data-location-center="" className="text-hint">
              {center}
            </p>
          ) : null}
        </div>
      ) : null}
      <NearbySection metro={details.metro} nearby={details.nearby} geoRadiusM={details.geo_radius_m} />
    </section>
  );
}
