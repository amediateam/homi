/**
 * Test support: the real catalogues of `@homi/i18n` through a relative import (no package link), a minimal `t`, a
 * USD price formatter, and city fixtures shaped like `GET /reference` and `GET /cities`.
 */
import { getMessages } from "../../i18n/src/messages";
import type { CityRef, CityStatsRef, FormatPrice, Translate } from "../src/types";

export type TestLocale = "ru" | "uz" | "en";
export const LOCALES: readonly TestLocale[] = ["ru", "uz", "en"];

type Tree = { readonly [key: string]: string | Tree };

/** `t` over the merged catalogue of a locale; a missing key throws so a wrong key cannot pass a test. */
export function translator(locale: TestLocale): Translate {
  const messages = getMessages(locale) as unknown as Tree;
  return (key, values = {}) => {
    let node: string | Tree | undefined = messages;
    for (const part of key.split(".")) {
      node = typeof node === "object" ? node[part] : undefined;
    }
    if (typeof node !== "string") {
      throw new Error(`No message for ${key}`);
    }
    return node.replace(/\{(\w+)\}/g, (whole, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : whole,
    );
  };
}

/** `$` and the integer with plain digits (the money formatter itself is `@homi/i18n/format`'s). */
export const usd: FormatPrice = (amount) => `$${amount}`;

const NAMES: Record<string, Record<TestLocale, string>> = {
  tashkent: { ru: "Ташкент", uz: "Toshkent", en: "Tashkent" },
  fergana: { ru: "Фергана", uz: "Fargʻona", en: "Fergana" },
  center: { ru: "Центр (внутри кольца)", uz: "Markaz (halqa ichida)", en: "Centre (inside the ring)" },
  near_center: { ru: "Ближе к центру", uz: "Markazga yaqin", en: "Near the centre" },
  yunusabad: { ru: "Юнусабадский", uz: "Yunusobod", en: "Yunusabad" },
  chilanzar: { ru: "Чиланзарский", uz: "Chilonzor", en: "Chilanzar" },
  mirabad: { ru: "Мирабадский", uz: "Mirobod", en: "Mirabad" },
  sergeli: { ru: "Сергелийский", uz: "Sergeli", en: "Sergeli" },
  margilan_road: { ru: "Маргиланская", uz: "Margʻilon yoʻli", en: "Margilan Road" },
};

const named = (code: string, locale: TestLocale) => ({ code, name: NAMES[code][locale] });

/** Tashkent: metro, medians, two zones, four districts. */
export function tashkent(locale: TestLocale = "ru"): CityRef {
  return {
    code: "tashkent",
    name: NAMES.tashkent[locale],
    is_region: false,
    center: { lat: 41.3111, lon: 69.2797 },
    zoom: 12,
    has_metro: true,
    has_median: true,
    zones: [named("center", locale), named("near_center", locale)],
    districts: ["yunusabad", "chilanzar", "mirabad", "sergeli"].map((code) => named(code, locale)),
  };
}

/** Fergana: no metro, no medians, no zones, one district. */
export function fergana(locale: TestLocale = "ru"): CityRef {
  return {
    code: "fergana",
    name: NAMES.fergana[locale],
    is_region: false,
    center: { lat: 40.3864, lon: 71.7864 },
    zoom: 12,
    has_metro: false,
    has_median: false,
    zones: [],
    districts: [named("margilan_road", locale)],
  };
}

export function cities(locale: TestLocale = "ru"): CityRef[] {
  return [tashkent(locale), fergana(locale)];
}

export function stats(overrides: Partial<CityStatsRef> = {}): CityStatsRef {
  return {
    code: "tashkent",
    counts: { rent_long: 4120, rent_daily: 310, sale: 2890 },
    price_presets: { rent_long: [300, 400, 500], rent_daily: [30, 50], sale: [40000, 60000] },
    typical_price: { rent_long: 700, rent_daily: 45, sale: 94000 },
    ...overrides,
  };
}
