import type { Locale } from "@homi/config";
import type { MessageKey } from "@homi/i18n";
import { formatCenter, formatMetroLabel, formatNumber, type MetroOptions, type Translate } from "@homi/i18n/format";

import { devFlags } from "@/lib/flags";

import type { ListingPreview } from "./types";

/**
 * The text lines of a listing card (`03` SCR-007, §1.12). The contract delivers the legacy split already done
 * (`price.display` / `period` / `kind`, the short `title`, `posted.label` / `when`), so these helpers only choose and
 * join server strings; the numbers they format themselves are area, floor and distances.
 */

const SEPARATOR = " · ";

/** Price kinds with a label (BR-API-156); any other value has none (Q-API-065), so this is not a `labelFor` table. */
const PRICE_KIND_LABELS: Readonly<Record<string, MessageKey>> = {
  down_payment: "card.downPayment",
  business: "card.businessPrice",
};

/** «первый взнос» or «цена за бизнес, помещение в аренде»; `null` for `null` and any other value. */
export function priceKindLabel(kind: string | null, t: Translate): string | null {
  return kind !== null && Object.hasOwn(PRICE_KIND_LABELS, kind) ? t(PRICE_KIND_LABELS[kind]) : null;
}

export interface PriceLine {
  /** The amount, or «Цена договорная» when `negotiable`. */
  amount: string;
  /** «/мес» and the like; empty when there is none. */
  period: string;
  /** The price-kind label; the card writes «· » before it, as legacy. */
  kind: string | null;
  negotiable: boolean;
}

/** Amount, period and price-kind label; without a price «Цена договорная» (`card.negotiable`). */
export function priceLine(item: Pick<ListingPreview, "price">, t: Translate): PriceLine {
  if (item.price === null) {
    return { amount: t("card.negotiable"), period: "", kind: null, negotiable: true };
  }
  return {
    amount: item.price.display,
    period: item.price.period ?? "",
    kind: priceKindLabel(item.price.kind, t),
    negotiable: false,
  };
}

/**
 * «title · {area} м² · {floor}/{total} эт. · market · 🐾 можно с животными»: each part only when known; area and
 * floor are left out at zero, as legacy.
 */
export function factsLine(
  item: Pick<ListingPreview, "title" | "area_total" | "floor" | "floors_total" | "market" | "pets_ok">,
  locale: Locale,
  t: Translate,
): string {
  const parts = [item.title];
  if (item.area_total) {
    parts.push(t("fmt.area", { area: formatNumber(item.area_total, locale) }));
  }
  if (item.floor && item.floors_total) {
    parts.push(t("fmt.floorOf", { floor: String(item.floor), total: String(item.floors_total) }));
  } else if (item.floor) {
    parts.push(t("fmt.floor", { floor: String(item.floor) }));
  }
  if (item.market.label) {
    parts.push(item.market.label);
  }
  if (item.pets_ok) {
    parts.push(t("fmt.pets"));
  }
  return parts.filter(Boolean).join(SEPARATOR);
}

/**
 * The age on the card: the part after « · » of the legacy string (BR-API-072), which the contract sends as
 * `posted.when`; `posted.label` only when `when` is empty (legacy showed the whole string without a separator).
 */
export function ageText(item: Pick<ListingPreview, "posted">): string | null {
  return item.posted.when || item.posted.label || null;
}

/**
 * The location line (BR-APP-030): district · landmark · (metro within 1.5 km, else «{km} км до центра»). A missing
 * part is left out; `null` when nothing is known. The metro rule and DEV-019 are `formatMetroLabel` of WP-22.
 */
export function locationLine(
  item: Pick<ListingPreview, "district" | "landmark" | "metro" | "center_km">,
  locale: Locale,
  t: Translate,
  { oneFormatter = devFlags.dev019OneDistanceFormatter }: MetroOptions = {},
): string | null {
  const metro = formatMetroLabel(item.metro?.name, item.metro?.km, locale, t, { oneFormatter });
  const parts = [item.district?.name, item.landmark, metro ?? formatCenter(item.center_km, locale, t)];
  return parts.filter(Boolean).join(SEPARATOR) || null;
}
