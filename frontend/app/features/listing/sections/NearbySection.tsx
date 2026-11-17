"use client";

import type { Locale } from "@homi/config";
import { formatDistance, type Translate } from "@homi/i18n/format";
import { type LucideIcon, MapPin, School, TrainFront, Trees } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";

import type { ListingDetails, ListingNearby } from "../listingData";

/** The metro row shows within this distance (BR-APP-029). */
const METRO_MAX_KM = 1.5;
/** Distances are approximate (`~`) from this geocoding radius; an unknown radius counts as 500 m (legacy). */
const APPROX_FROM_M = 400;
const DEFAULT_RADIUS_M = 500;

/** The kinds with an icon of their own; any other kind is drawn with the pin (fix of LB-APP-016). */
const KIND_ICONS: Readonly<Record<string, LucideIcon>> = { metro: TrainFront, park: Trees, school: School };

interface NearbyRow {
  kind: "metro" | "park" | "school" | "other";
  name: string;
  km: number;
  note: string | null;
}

/**
 * The rows of «Рядом» in order: the metro first when its distance is known and within 1.5 km, then the server's
 * places. Exported for `LocationSection`, which keeps its heading only when something is left to show.
 */
export function nearbyRows(metro: ListingDetails["metro"], nearby: readonly ListingNearby[]): NearbyRow[] {
  const rows: NearbyRow[] = [];
  if (metro && metro.km !== null && metro.km <= METRO_MAX_KM) {
    rows.push({ kind: "metro", name: metro.name, km: metro.km, note: null });
  }
  for (const place of nearby) {
    const kind = place.kind === "park" || place.kind === "school" ? place.kind : "other";
    rows.push({ kind, name: place.name, km: place.km, note: place.note });
  }
  return rows;
}

/**
 * «Рядом» (BR-APP-031): one row per place — its icon, the name with the server's note under it, and the distance
 * through `formatDistance`, with `~` for every row when the location is approximate (`geo_radius_m ?? 500` from
 * 400 m). Places of one kind may repeat, so the React key is kind, name and index. No row → nothing.
 */
export function NearbySection({
  metro,
  nearby,
  geoRadiusM,
}: {
  metro: ListingDetails["metro"];
  nearby: readonly ListingNearby[];
  geoRadiusM: number | null;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  const rows = nearbyRows(metro, nearby);
  if (rows.length === 0) {
    return null;
  }
  const approx = (geoRadiusM ?? DEFAULT_RADIUS_M) >= APPROX_FROM_M;

  return (
    <section data-section="nearby" className="flex flex-col gap-[6px] pt-[6px]">
      <h3 className="text-[15px] font-semibold">{t("listing.nearby")}</h3>
      <ul className="flex flex-col">
        {rows.map((row, index) => {
          const Icon = KIND_ICONS[row.kind] ?? MapPin;
          return (
            <li key={`${row.kind}:${row.name}:${index}`} data-nearby={row.kind} className="flex items-center gap-[10px] py-[6px]">
              <Icon size={18} strokeWidth={2} aria-hidden className="flex-none text-hint" />
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="break-words">{row.name}</span>
                {row.note ? (
                  <span data-nearby-note="" className="text-[13px] text-hint">
                    {row.note}
                  </span>
                ) : null}
              </span>
              <span className="flex-none text-hint">{formatDistance(row.km, locale, translate, { approx })}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
