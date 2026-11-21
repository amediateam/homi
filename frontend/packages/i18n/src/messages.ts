import type { Locale } from "@homi/config";

import homiEn from "../messages/homi/en.json";
import homiRu from "../messages/homi/ru.json";
import homiUz from "../messages/homi/uz.json";
import legacyEn from "../messages/legacy/en.json";
import legacyRu from "../messages/legacy/ru.json";
import legacyUz from "../messages/legacy/uz.json";

/**
 * The catalogue shape: the generated `legacy` layer with the hand-written `homi` layer over it, typed from `ru`
 * (the locale every other one falls back to). next-intl's `AppConfig` takes it in the app.
 */
export type Messages = typeof legacyRu & typeof homiRu;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every message path, e.g. `"sheet.market._"` or `"demo.label"`. */
export type MessageKey = Leaves<Messages>;

export type MessageTree = { [key: string]: string | MessageTree };

/** `override` merged into `base` key by key; neither argument is changed. */
export function mergeMessages(base: MessageTree, override: MessageTree): MessageTree {
  const out: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] =
      typeof value === "object" && typeof current === "object" ? mergeMessages(current, value) : value;
  }
  return out;
}

const layers: Record<Locale, [MessageTree, MessageTree]> = {
  ru: [legacyRu, homiRu],
  uz: [legacyUz, homiUz],
  en: [legacyEn, homiEn],
};

const cache = new Map<Locale, Messages>();

/**
 * The messages of a locale: its `legacy` layer, its `homi` layer over that, the whole merged over `ru`, so a key
 * missing in uz or en shows the ru message (WP-20 runtime rules).
 */
export function getMessages(locale: Locale): Messages {
  const cached = cache.get(locale);
  if (cached) {
    return cached;
  }
  const own = (target: Locale) => mergeMessages(...layers[target]);
  const merged = (locale === "ru" ? own("ru") : mergeMessages(own("ru"), own(locale))) as Messages;
  cache.set(locale, merged);
  return merged;
}
