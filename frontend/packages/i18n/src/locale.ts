import type { Locale } from "@homi/config";

/** The `lang` attribute legacy sets: the language part of its Intl locale (`03` §3.1). */
export function htmlLang(locale: Locale): string {
  return locale;
}

/**
 * Intl locale for numbers in the Mini App: `ru-RU` for ru and uz (space thousands separator, decimal comma) and
 * `en-GB` for en — the legacy rule of `03` §3.1. Not `intlLocale` of `@homi/utils`, which maps en to en-US.
 */
export function numberLocale(locale: Locale): "ru-RU" | "en-GB" {
  return locale === "en" ? "en-GB" : "ru-RU";
}
