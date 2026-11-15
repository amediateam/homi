import type { Locale } from "@homi/config";

import { devFlags } from "@/lib/flags";

import { launchUser } from "./sdk";

/** The raw Telegram language of the launch (TMA-008): the SDK user, else the fragment's `user` JSON. */
export function languageCode(): string {
  return launchUser()?.language_code ?? "";
}

/**
 * The locale before sign-in (BR-APP-050). With `dev020OneLanguageDetector` off, as legacy: `uz*` → `uz`, anything
 * else → `ru`, so an English Telegram user sees Russian until `me.locale` arrives (LB-APP-032). With it on — and
 * for the no-access screen of WP-23, which passes `oneDetector: true` — `en*` → `en` as well. The boot script
 * repeats this rule in ES5.
 */
export function detectLocale(code: string, { oneDetector = devFlags.dev020OneLanguageDetector }: { oneDetector?: boolean } = {}): Locale {
  const lower = code.toLowerCase();
  if (lower.startsWith("uz")) {
    return "uz";
  }
  if (oneDetector && lower.startsWith("en")) {
    return "en";
  }
  return "ru";
}
