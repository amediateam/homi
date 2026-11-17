import type { components } from "@homi/types";

import { previewOf } from "./listing";

type ListingDetails = components["schemas"]["ListingDetailsResource"];
type ContactData = components["schemas"]["ContactResource"];

const PHOTOS = Array.from({ length: 8 }, (_, i) => `https://cdn.homi.loc/stub/100001/${i + 1}.jpg?e=0&s=stub`);

/**
 * The details of stub listing 100001 (WP-26) over `previewOf()`, with `overrides` on top; nested objects are replaced
 * whole. The texts are the API's answer, masked by `PhoneMasker` (DEC-52) — never the catalogue's raw strings, which
 * still hold the number.
 */
export function detailsOf(overrides: Partial<ListingDetails> = {}): ListingDetails {
  const preview = previewOf();
  return {
    ...preview,
    photos: { preview: preview.photos.preview, count: 8, cover: null, items: PHOTOS },
    market: { label: "Вторичка", code: "secondary", median_delta: -0.12, tone: "good" },
    location: { lat: 41.36512, lon: 69.28431 },
    facts: [
      { key: "type", label: "Тип", value: "Квартира" },
      { key: "rooms", label: "Комнат", value: "2" },
      { key: "area", label: "Площадь", value: "54 м²" },
      { key: "floor", label: "Этаж", value: "3 из 9" },
    ],
    nearby: [
      { kind: "park", name: "Парк", km: 0.4, note: null },
      { kind: "school", name: "Школа", km: 0.9, note: null },
    ],
    stats: { days_listed: 3, publications: 2, channels: 2, views: 41 },
    price_history: [
      {
        at: "2026-11-10T07:00:00+00:00",
        channel: "stub_channel_a",
        url: "https://t.me/stub_channel_a/3979",
        text: null,
        kind: "published",
        price_usd: 648,
        change_pct: null,
      },
      {
        at: "2026-11-14T06:40:00+00:00",
        channel: "stub_channel_a",
        url: "https://t.me/stub_channel_a/4001",
        text: null,
        kind: "price_down",
        price_usd: 600,
        change_pct: -7.4,
      },
    ],
    geo_radius_m: 500,
    author: { kind: "phone", label: "+998 ** *** ** 67", count: 3 },
    owner_label: "Хозяин",
    contact: { has_phone: true, contact_url: "https://t.me/stub_author_6", contact_paid: false },
    summary: "2-комн. квартира, 54 м². Рядом метро Минор. Тел. +998 ** *** ** 67",
    offers: [{ text: "Торг", url: null }],
    original: {
      text: "Сдаётся 2-комн. квартира, 54 м². Чисто, уютно. Звоните: +998 ** *** ** 67",
      url: "https://t.me/stub_channel_a/4001",
      deleted: false,
    },
    sources: [{ handle: "stub_channel_a", url: "https://t.me/stub_channel_a/4001" }],
    comparison: {
      value: 672,
      own: 600,
      n: 14,
      metric: "month",
      scope: "district",
      rooms: 2,
      near_class: null,
      radius_km: null,
      district: "Юнусабад",
      place_value: null,
      note: null,
      updated: "2026-11-12",
      has_reason: false,
      price_usd: 600,
      price_per_m2: null,
    },
    ...overrides,
  };
}

/** The stub's contact answer of 100001 (`POST /listings/{number}/contact`), valid for ten minutes from now. */
export function contactOf(overrides: Partial<ContactData> = {}): ContactData {
  return {
    call_url: "https://api.homi.loc/call/stub-token-100001",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    phone: "+998000000067",
    phone_display: "+998 00 000-00-67",
    ...overrides,
  };
}
