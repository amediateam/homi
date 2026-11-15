import { displayTimeZone, type Locale } from "@homi/config";

import { numberLocale } from "../locale";
import type { Translate } from "./number";

/** An ISO-8601 string of the API (`history[].at`, `median_updated`), a timestamp or a `Date`. */
export type DateInput = string | number | Date;

/**
 * The zone a product date is read in; `undefined` is the device zone. A device-zone value is unknown on the server,
 * so the caller renders it on the client only (`preventing-flash-before-hydration.md`).
 */
export type ZoneOptions = { timeZone?: string };

/** Uzbek short months; legacy keeps them outside the catalogues (`03` §3.1). */
const UZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"] as const;

/** The Intl locales of legacy dates (`03` §3.1); uz has its own months. */
const DATE_LOCALE = { ru: "ru-RU", en: "en-GB" } as const;

const TASHKENT_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: displayTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The `timeZone` of product dates for `dev014TashkentDates` (LB-APP-025): off, the device zone (`undefined`) as
 * legacy; on, Asia/Tashkent.
 */
export function dateTimeZone(tashkentDates: boolean): string | undefined {
  return tashkentDates ? displayTimeZone : undefined;
}

function toDate(value: DateInput | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

/** «5 мар» (ru, the dot removed), «5 Mar» (en), «5-mar» (uz); `null` for an invalid date. */
export function formatShortDate(value: DateInput, locale: Locale, { timeZone }: ZoneOptions = {}): string | null {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  if (locale === "uz") {
    const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", timeZone }).formatToParts(date);
    return `${part(parts, "day")}-${UZ_MONTHS[Number(part(parts, "month")) - 1]}`;
  }
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], { day: "numeric", month: "short", timeZone })
    .format(date)
    .replace(".", "");
}

/** «19:30»: hours and minutes in the number locale; `null` for an invalid date. */
export function formatTime(value: DateInput, locale: Locale, { timeZone }: ZoneOptions = {}): string | null {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  return new Intl.DateTimeFormat(numberLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

/**
 * «Обновлено N назад» of the market sheet: under 2 minutes «только что», then minutes, hours under 48, then days
 * (`market.info.ago*`); a time in the future is «только что». `null` without a valid date or clock.
 */
export function formatAgo(value: DateInput | null | undefined, now: Date | number, t: Translate): string | null {
  const date = toDate(value);
  const clock = now instanceof Date ? now.getTime() : now;
  if (!date || !Number.isFinite(clock)) {
    return null;
  }
  const minutes = Math.round((clock - date.getTime()) / 60_000);
  if (minutes < 2) {
    return t("market.info.agoNow");
  }
  if (minutes < 60) {
    return t("market.info.agoMin", { n: minutes });
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return t("market.info.agoHour", { n: hours });
  }
  return t("market.info.agoDay", { n: Math.round(hours / 24) });
}

/** The Tashkent calendar day as `YYYY-MM-DD`, whatever the device zone (fix of LB-APP-010); `null` if invalid. */
export function tashkentDayKey(value: DateInput): string | null {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  const parts = TASHKENT_DAY.formatToParts(date);
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}
