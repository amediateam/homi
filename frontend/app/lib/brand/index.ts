import type { Locale } from "@homi/config";

/** A link per locale; `null` hides the row that would show it. */
export type LocaleLink = Record<Locale, string | null>;

/**
 * The brand layer (WP-20, DEC-40): the only place where HOMI's name, bot, links and artwork are spelled. The
 * interface is the legacy one; its brand words live here and in the `homi` layer of @homi/i18n, nowhere else.
 */
export const brand = {
  name: "HOMI",
  /** The bot's username without `@`; empty hides every bot link. */
  botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "",
  /** Client storage keys are `homi-*` (WP-21). */
  storagePrefix: "homi",
  /** All `null` until the product owner supplies them. */
  links: {
    methodology: { ru: null, uz: null, en: null } satisfies LocaleLink as LocaleLink,
    instagram: { ru: null, uz: null, en: null } satisfies LocaleLink as LocaleLink,
    privacy: { ru: null, uz: null, en: null } satisfies LocaleLink as LocaleLink,
  },
  /**
   * Neutral placeholders of the legacy sizes (mascots 120 px, `hooray` 132 px); the final artwork is a product-owner
   * input and replaces the files without a code change.
   */
  assets: {
    logo: "/brand/logo.svg",
    favicon: "/brand/favicon.svg",
    emptyMagnifier: "/brand/empty-magnifier.svg",
    emptyShrug: "/brand/empty-shrug.svg",
    hooray: "/brand/hooray.svg",
  },
} as const;
