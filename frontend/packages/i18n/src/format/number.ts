import type { Locale } from "@homi/config";

import { numberLocale } from "../locale";
import type { MessageKey } from "../messages";

/**
 * The translation function the formatters take: next-intl's `t` in the app, any `(key, values) => string` in a
 * test. Plural keys get their count as a number, so ICU picks the form.
 */
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

/** A rounded integer with the thousands separator of the number locale: «1 235» in ru and uz, «1,235» in en. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(Math.round(value));
}

/** At most one fraction digit in the number locale: «1,3» in ru and uz, «1.3» in en; «2» stays «2». */
export function formatDecimal(value: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 1 }).format(value);
}

/** Kilometres with exactly one fraction digit in the number locale: «3,0», «1,3» (`03` §3.5). */
export function formatKm(km: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    km,
  );
}

/** «1 234 объявления»: the number in the number locale and the counted noun of `pluralKey` for `n`. */
export function formatCount(n: number, pluralKey: MessageKey, locale: Locale, t: Translate): string {
  return `${formatNumber(n, locale)} ${t(pluralKey, { n })}`;
}

/**
 * An owner's usual response time (WP-83, fix of LB-APP-076): below 60 the minutes, below 1 440 the hours, else the
 * days, each rounded and through `Intl.NumberFormat` with the unit style `short` («15 мин», «3 ч», «2 дн.»).
 */
export function formatResponseTime(minutes: number, locale: Locale): string | null {
  // No time to show: nothing, never «0 мин» or «NaN».
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const value = Math.max(1, Math.round(minutes));
  const [amount, unit] = value < 60 ? [value, "minute"] : value < 1440 ? [Math.round(value / 60), "hour"] : [Math.round(value / 1440), "day"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" }).format(amount);
}
