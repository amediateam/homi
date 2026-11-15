import type { Locale } from "@homi/config";

import { formatKm, formatNumber, type Translate } from "./number";

/** `oneFormatter` is `dev019OneDistanceFormatter` (LB-APP-031), filled by the caller. */
export type MetroOptions = { oneFormatter?: boolean };

/** `approx` adds `~`: legacy sets it when `(geo_radius_m ?? 500) ≥ 400`. */
export type DistanceOptions = { approx?: boolean };

/** A metro station is shown on a card within this distance (BR-APP-029). */
const METRO_MAX_KM = 1.5;
/** Legacy metro label: the name alone under this distance. */
const METRO_NAME_ONLY_KM = 0.05;
/** `formatDistance`: «рядом» under this distance. */
const HERE_KM = 0.1;
/** `formatDistance`: kilometres from this distance, metres below it. */
const KM_FROM = 0.95;

function known(km: number | null | undefined): km is number {
  return typeof km === "number" && Number.isFinite(km) && km >= 0;
}

/** Metres rounded to 100. */
function metres(km: number, locale: Locale): string {
  return formatNumber(Math.round(km * 10) * 100, locale);
}

/**
 * The metro part of a card's place line (BR-APP-029): nothing beyond 1.5 km; the name alone under 50 m; else
 * «{metro} · {m} м» with metres rounded to 100, so «· 1 500 м» at 1.5 km.
 *
 * LB-APP-031, `oneFormatter` on: the thresholds of `formatDistance` — the name alone under 100 m, metres under
 * 0.95 km, «{metro} · {km} км» with one decimal above — inside the same 1.5 km cap.
 */
export function formatMetroLabel(
  name: string | null | undefined,
  km: number | null | undefined,
  locale: Locale,
  t: Translate,
  { oneFormatter = false }: MetroOptions = {},
): string | null {
  if (!name || !known(km) || km > METRO_MAX_KM) {
    return null;
  }
  if (km < (oneFormatter ? HERE_KM : METRO_NAME_ONLY_KM)) {
    return name;
  }
  if (oneFormatter && km >= KM_FROM) {
    return `${name} · ${t("near.km", { km: formatKm(km, locale) })}`;
  }
  return t("fmt.metroDist", { metro: name, m: metres(km, locale) });
}

/**
 * A distance in «Рядом» (BR-APP-031): under 0.1 km «рядом»; under 0.95 km metres rounded to 100; else kilometres
 * with one decimal; `~` before metres and kilometres when approximate. `null` for a missing or invalid distance.
 */
export function formatDistance(
  km: number | null | undefined,
  locale: Locale,
  t: Translate,
  { approx = false }: DistanceOptions = {},
): string | null {
  if (!known(km)) {
    return null;
  }
  if (km < HERE_KM) {
    return t("near.here");
  }
  const label = km < KM_FROM ? t("near.m", { m: metres(km, locale) }) : t("near.km", { km: formatKm(km, locale) });
  return approx ? `~${label}` : label;
}

/** «3,4 км до центра» with one decimal; `null` for a missing or invalid distance. */
export function formatCenter(km: number | null | undefined, locale: Locale, t: Translate): string | null {
  if (!known(km)) {
    return null;
  }
  return t("fmt.centerKm", { km: formatKm(km, locale) });
}
