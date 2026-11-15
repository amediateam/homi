import { defaultLocale, locales } from "@homi/config";
import { defineRouting } from "next-intl/routing";

/** Name of next-intl's locale cookie; `proxy.ts` reads it, next-intl's router writes it on a locale switch. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Locale routing of the Mini App (WP-20, DEC-44): the locale is always the first segment. next-intl's own
 * middleware is not used — `proxy.ts` owns the redirect, because the legacy rule (cookie, else `ru`, never
 * `Accept-Language`) is not one of its detection modes.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeCookie: { name: LOCALE_COOKIE },
  localeDetection: false,
  alternateLinks: false,
});
