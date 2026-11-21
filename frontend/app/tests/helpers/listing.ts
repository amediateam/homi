import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import type { Translate } from "@homi/i18n/format";
import { createTranslator } from "next-intl";

import type { ListingPreview } from "@/features/feed/types";

/** A preview of the stub catalogue's shape (WP-12) with `overrides` on top; nested objects are replaced whole. */
export function previewOf(overrides: Partial<ListingPreview> = {}): ListingPreview {
  return {
    number: 100001,
    origin: "legacy",
    deal: "rent_long",
    type: "apartment",
    title: "2-комн. квартира, 54 м²",
    price: { display: "$600", period: "/мес", alt: "≈ 7,7 млн сум", notes: [], usd: 600, kind: null },
    rooms: 2,
    area_total: 54,
    floor: 3,
    floors_total: 9,
    district: { code: "yunusobod", name: "Юнусабад" },
    place: null,
    landmark: "Мегапланет",
    metro: { name: "Минор", km: 0.7 },
    center_km: 4.2,
    location: null,
    photos: { preview: ["https://cdn.homi.loc/stub/100001/1.jpg?e=0&s=stub"], count: 8, cover: null },
    has_video: false,
    pets_ok: false,
    is_owner: null,
    owner_verified: false,
    posted: { label: "Опубликовано", when: "сегодня", at: null },
    status_text: null,
    market: { label: null, median_delta: null, tone: null },
    favorite: false,
    viewed: false,
    source_ref: null,
    ...overrides,
  };
}

/** next-intl's `t` over the real catalogues, typed as the formatters take it. */
export function translator(locale: Locale): Translate {
  const t = createTranslator({ locale, messages: getMessages(locale) });
  return (key, values) => t(key as never, values as never);
}
