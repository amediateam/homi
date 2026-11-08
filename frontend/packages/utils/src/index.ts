import { defaultLocale, displayTimeZone, type Currency, type Locale } from "@homi/config";

/**
 * Format a price stored in minor units (tiyin / cents) with its currency (ADR-0006).
 * UZS has no fractional display; USD shows cents only when present.
 */
export function formatPrice(amountMinor: number, currency: Currency, locale: Locale = defaultLocale): string {
  const amount = amountMinor / 100;
  const fractionDigits = currency === "UZS" || Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: currency === "UZS" ? "code" : "symbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/** Format an ISO-8601 UTC timestamp from the API in the product time zone. */
export function formatDateTime(iso: string, locale: Locale = defaultLocale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: displayTimeZone,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(iso));
}

/** Map product locales to BCP-47 tags understood by Intl (Uzbek is Latin script). */
export function intlLocale(locale: Locale): string {
  switch (locale) {
    case "uz":
      return "uz-Latn-UZ";
    case "en":
      return "en-US";
    default:
      return "ru-RU";
  }
}
