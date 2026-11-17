"use client";

import { ListingCard, type ListingCardProps } from "@/features/feed/ListingCard";
import { ListingCardSkeleton } from "@/features/feed/ListingCardSkeleton";
import type { ListingPreview } from "@/features/feed/types";

import { Entry } from "./Entry";

/**
 * The states of the listing card (WP-24) with fixture cards: a review on a device in ru / uz / en, light and dark.
 * The photos are those `sources:publish-stub-media` puts on the CDN; the hearts save through the real Server Action,
 * and a tap opens the listing address. The cards' own texts come from the catalogue of the current locale; the
 * fixture's server strings are Russian, as the stubs send them.
 */
export function CardStates() {
  return (
    <Entry id="card" title="ListingCard">
      <div className="flex flex-col gap-[28px]">
        {STATES.map((state) => (
          <div key={state.id} data-testid={`gallery-card-${state.id}`} className="flex flex-col gap-2">
            <p className="text-[13px] text-hint">{state.title}</p>
            <ListingCard {...state.props} />
          </div>
        ))}
        <div data-testid="gallery-card-skeleton" className="flex flex-col gap-2">
          <p className="text-[13px] text-hint">Скелет (первая загрузка)</p>
          <ListingCardSkeleton />
        </div>
      </div>
    </Entry>
  );
}

const CDN = (process.env.NEXT_PUBLIC_CDN_URL ?? "").replace(/\/$/, "");

/** A stub photo on the CDN (`stub/<listing>/<n>.jpg`); `100000` has none, so it fails to load. */
const photo = (listing: number, index: number) => `${CDN}/stub/${listing}/${index}.jpg?e=0&s=stub`;
const photos = (listing: number, count = 3) => Array.from({ length: count }, (_, index) => photo(listing, index + 1));

/** A card of the stub catalogue's shape (WP-12) with `overrides` on top; nested objects are replaced whole. */
function card(number: number, overrides: Partial<ListingPreview> = {}): ListingPreview {
  return {
    number,
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
    photos: { preview: photos(100001), count: 8, cover: null },
    has_video: false,
    pets_ok: false,
    is_owner: null,
    owner_verified: false,
    posted: { label: "Опубликовано", when: "сегодня", at: null },
    status_text: null,
    market: { label: "Вторичка", median_delta: null, tone: null },
    favorite: false,
    viewed: false,
    source_ref: null,
    ...overrides,
  };
}

/** `photos` of a card: `count` stub photos of `listing` (three by default). */
const strip = (listing: number, count = 3) => ({ preview: photos(listing, count), count, cover: null });
const market = (delta: number, tone: string) => ({ label: "Вторичка", median_delta: delta, tone });
type PriceKind = "down_payment" | "business" | null;
const price = (display: string, period: string | null, kind: PriceKind = null) => {
  return { display, period, alt: null, notes: [], usd: null, kind };
};

const STATES: { id: string; title: string; props: ListingCardProps }[] = [
  {
    id: "full",
    title: "Полная: три фото, «Хозяин», ниже рынка",
    props: { item: card(100001, { is_owner: true, market: market(-0.12, "good") }), eager: true },
  },
  {
    id: "compact",
    title: "Компактная (карточка на карте): одно фото, короткая оценка",
    props: {
      item: card(100012, { is_owner: true, market: market(-0.12, "good"), photos: strip(100005) }),
      compact: true,
    },
  },
  {
    id: "negotiable",
    title: "Цена договорная",
    props: { item: card(100006, { price: null, photos: strip(100006) }) },
  },
  {
    id: "down-payment",
    title: "Первый взнос",
    props: {
      item: card(100008, {
        deal: "sale",
        title: "3-комн. квартира, 82 м²",
        price: price("$18 000", null, "down_payment"),
        photos: strip(100008),
      }),
    },
  },
  {
    id: "business",
    title: "Цена за бизнес",
    props: {
      item: card(100004, {
        type: "commercial",
        title: "Помещение, 120 м²",
        price: price("$45 000", null, "business"),
        floor: 1,
        floors_total: null,
        photos: strip(100004),
      }),
    },
  },
  {
    id: "video",
    title: "С видео",
    props: { item: card(100002, { type: "house", title: "Дом, 160 м²", has_video: true, photos: strip(100002) }) },
  },
  {
    id: "no-photos",
    title: "Без фото",
    props: { item: card(100003, { type: "room", title: "Комната", photos: strip(100003, 0) }) },
  },
  {
    id: "broken-photo",
    title: "Фото не загрузилось",
    props: { item: card(100007, { photos: { preview: [photo(100000, 1)], count: 1, cover: null } }) },
  },
  {
    id: "badge-suspicious",
    title: "Бейдж «Подозрительно дёшево»",
    props: { item: card(100013, { is_owner: true, market: market(-0.48, "suspicious"), photos: strip(100009) }) },
  },
  {
    id: "badge-check",
    title: "Бейдж «Проверьте цену»",
    props: {
      item: card(100009, { deal: "sale", is_owner: true, market: market(0.35, "check"), photos: strip(100009) }),
    },
  },
  {
    id: "badge-owner-verified",
    title: "Бейдж «Хозяин ✓», обычная цена, можно с животными",
    props: {
      item: card(100014, {
        is_owner: true,
        owner_verified: true,
        pets_ok: true,
        market: market(0.02, "same"),
        photos: strip(100010),
      }),
    },
  },
  {
    id: "badge-owner",
    title: "Бейдж «Хозяин», посуточно, без оценки",
    props: {
      item: card(100005, {
        deal: "rent_daily",
        is_owner: true,
        price: price("$45", "/сутки"),
        photos: strip(100005),
      }),
    },
  },
  {
    id: "badge-below-market",
    title: "Бейдж «Ниже рынка», дальше 1,5 км от метро",
    props: {
      item: card(100010, {
        is_owner: false,
        metro: { name: "Чиланзар", km: 2.4 },
        market: market(-0.12, "good"),
        photos: strip(100011),
      }),
    },
  },
  {
    id: "viewed",
    title: "Просмотрено (глаз)",
    props: { item: card(100011, { photos: strip(100007) }), viewed: true },
  },
  {
    id: "favorite",
    title: "В избранном, дороже рынка",
    props: { item: card(100017, { market: market(0.4, "high") }), favorite: true },
  },
  {
    id: "status",
    title: "Статус объявления, неизвестный тон рынка",
    props: {
      item: card(100015, {
        status_text: "Снято с публикации",
        market: market(-0.12, "unknown"),
        photos: strip(100006),
      }),
    },
  },
];
