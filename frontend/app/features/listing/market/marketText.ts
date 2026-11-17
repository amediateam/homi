import type { Locale } from "@homi/config";
import type { MessageKey } from "@homi/i18n";
import { formatAgo, formatDecimal, formatKm, type Money, type Translate } from "@homi/i18n/format";

import type { ListingComparison, ListingDetails } from "@/features/listing/listingData";
import { reportError } from "@/lib/errors/report";

/**
 * The texts and the scale of the market block and the market sheet (WP-26, BR-APP-028, SCR-022): pure functions of
 * the comparison, with the legacy wording, joiners and rounding. The locale, `t` and the money formatter are
 * arguments, so the block, the sheet and the tests share one rule.
 */

/** The marker stays inside the scale: 4 % … 96 %. */
export const MARKER_MIN = 4;
export const MARKER_MAX = 96;
/** A delta of ±40 % reaches the edge of the scale. */
export const SCALE_EDGE = 0.4;
/** «в N раза» from +90 %, as the verdict (BR-APP-027). */
export const TIMES_FROM = 0.9;

/** The phrases of «похожих квартир рядом: {alike}» (legacy: comma and space). */
export const JOIN_ALIKE = ", ";
/** The own price and its conclusion (legacy: space, em dash, space). */
export const JOIN_CONCLUSION = " — ";

export interface MarketTextContext {
  locale: Locale;
  t: Translate;
  money: Pick<Money, "format">;
}

type Comparison = Pick<ListingComparison, "metric" | "has_reason">;

/** The marker's left edge in percent: `clamp(4, 96, 50 + delta / 0.4 × 50)`. */
export function markerPosition(delta: number): number {
  return Math.min(MARKER_MAX, Math.max(MARKER_MIN, 50 + (delta / SCALE_EDGE) * 50));
}

/** The listing's own value in the comparison's metric; `null` gives no marker and no own paragraph. */
export function ownValue(c: ListingComparison): number | null {
  return c.own ?? (c.metric === "m2" ? c.price_per_m2 : c.price_usd);
}

/**
 * The block shows (D-4) when the verdict of `verdict.ts` exists, the comparison is there and the delta is known;
 * `comparison.value` is never null in the contract.
 */
export function showsMarket(d: Pick<ListingDetails, "comparison" | "market">, hasVerdict: boolean): boolean {
  return hasVerdict && d.comparison !== null && d.market.median_delta !== null;
}

/** «Сравнение с похожими рядом», «… с городом», else «… с районом». */
export function marketTitleKey(scope: string | null): MessageKey {
  if (scope === "near") {
    return "market.titleNear";
  }
  return scope === "city" ? "market.titleCity" : "market.title";
}

/** The unit after «обычно {value}»: per m² a month with a reason, per m², else a month. */
export function unitKey(c: Comparison): MessageKey {
  if (c.metric === "m2") {
    return c.has_reason ? "unit.m2Month" : "unit.m2";
  }
  return "unit.month";
}

/** `{rooms}` of the context lines (legacy): `""` for none, `1`…`3`, `4+`; any other number rounded. */
export function roomsParam(rooms: number | null): string {
  if (rooms === null || rooms <= 0) {
    return "";
  }
  if (rooms >= 4) {
    return "4+";
  }
  return Number.isInteger(rooms) ? String(rooms) : String(Math.round(rooms));
}

/** `{cls}` of the near lines: « в ЖК», « в обычных домах» (the keys carry the leading space), else nothing. */
export function classParam(nearClass: string | null, t: Translate): string {
  if (nearClass === "jk") {
    return t("market.clsJk");
  }
  return nearClass === "house" ? t("market.clsHouse") : "";
}

/**
 * The context line under the block's title (legacy `marketContext`): by metric and scope, the sale variants by the
 * deal; for a `mixed` tone with a place value « · по району {place}» is appended. `null` without a comparison.
 */
export function contextLine(d: Pick<ListingDetails, "comparison" | "deal" | "market">, ctx: MarketTextContext): string | null {
  const c = d.comparison;
  if (c === null) {
    return null;
  }
  const { locale, t, money } = ctx;
  const sale = d.deal === "sale";
  const n = String(c.n ?? 0);
  const district = c.district ?? "";
  const rooms = roomsParam(c.rooms);
  let line: string;
  if (c.metric === "person") {
    line = t("market.ctxPerson", { district, n });
  } else if (c.scope === "near") {
    const km = c.radius_km === null ? "" : formatKm(c.radius_km, locale);
    line = t(sale ? "market.ctxNearSale" : "market.ctxNear", { n, rooms, cls: classParam(c.near_class, t), km });
  } else if (c.metric === "m2" && c.has_reason) {
    line = t("market.ctxM2", { district });
  } else if (c.scope === "city") {
    line = t(sale ? "market.ctxCitySale" : "market.ctxCity", { rooms, district, n });
  } else {
    line = t(sale ? "market.ctxDistrictSale" : "market.ctxDistrict", { rooms, district, n });
  }
  if (d.market.tone === "mixed" && c.place_value !== null) {
    line += t("market.ctxPlace", { place: money.format(c.place_value) });
  }
  return line;
}

let roomsReported = false;

/** The keys of «тоже однокомнатные» … «тоже трёхкомнатные». */
const ROOMS_KEYS: Readonly<Record<number, MessageKey>> = {
  1: "market.v3.rooms1",
  2: "market.v3.rooms2",
  3: "market.v3.rooms3",
};

/**
 * The rooms phrase of the sheet, a total function (fix of LB-APP-015): 1–3 their own words, 4 and more «тоже от 4
 * комнат», 0 «тоже студии», any other number «тоже {n}-комн.» with `n` rounded — reported once per launch, with no
 * value in the report; `null` has none.
 */
export function roomsPhrase(rooms: number | null, t: Translate): string | null {
  if (rooms === null) {
    return null;
  }
  if (Object.hasOwn(ROOMS_KEYS, rooms)) {
    return t(ROOMS_KEYS[rooms]);
  }
  if (rooms >= 4) {
    return t("market.v3.rooms4");
  }
  if (rooms === 0) {
    return t("market.v3.rooms0");
  }
  if (!roomsReported) {
    roomsReported = true;
    reportError(new Error("comparison.rooms"), { kind: "error", where: "market.rooms" });
  }
  return t("market.v3.roomsN", { n: Math.round(rooms) });
}

/**
 * The radius of a near comparison (legacy): under 1 km in hundreds of metres, at least 100 («100 м» also for none
 * and for 0; 0.95–0.999 km reads «1000 м», the legacy rule), else kilometres with one decimal. The metres go in as a
 * string, so ICU does not group them; the units carry the catalogue's no-break space.
 */
export function radiusText(km: number | null, locale: Locale, t: Translate): string {
  const value = km !== null && Number.isFinite(km) ? km : 0;
  if (value < 1) {
    return t("market.v3.m", { m: String(Math.max(100, Math.round(value * 10) * 100)) });
  }
  return t("market.v3.km", { km: formatKm(value, locale) });
}

/** A value of the comparison (legacy `formatValue`): per m² (a month with a reason) around the money, else the money. */
export function valueText(value: number, c: Comparison, ctx: MarketTextContext): string {
  const amount = ctx.money.format(value);
  if (c.metric === "m2") {
    return ctx.t(c.has_reason ? "market.v3.perM2Month" : "market.v3.perM2", { value: amount });
  }
  return amount;
}

/** `{how}` of «… дороже.» / «… дешевле.»: «в 1,9 раза» from +90 %, else «на 12%». */
export function howText(delta: number, locale: Locale, t: Translate): string {
  if (delta >= TIMES_FROM) {
    return t("market.v3.times", { x: formatDecimal(Math.round((1 + delta) * 10) / 10, locale) });
  }
  return t("market.v3.pct", { pct: String(Math.round(Math.abs(delta) * 100)) });
}

export interface MarketParagraphs {
  /** How the sample was found. */
  sample: string;
  /** Where the median lies. */
  median: string;
  /** The own price and the conclusion; `null` without an own value. */
  own: string | null;
}

/** «тоже в ЖК», «тоже в обычном доме», else none. */
function classPhrase(nearClass: string | null, t: Translate): string | null {
  if (nearClass === "jk") {
    return t("market.v3.jk");
  }
  return nearClass === "house" ? t("market.v3.house") : null;
}

/**
 * The sample paragraph: the near phrases joined (a per-m² comparison has no rooms phrase, even with rooms set),
 * else the district or the city of the comparison.
 */
function sampleText(c: ListingComparison, { locale, t }: MarketTextContext): string {
  const n = c.n ?? 0;
  if (c.scope === "near") {
    const rooms = c.metric === "m2" ? null : roomsPhrase(c.rooms, t);
    const cls = classPhrase(c.near_class, t);
    const within = t("market.v3.within", { dist: radiusText(c.radius_km, locale, t) });
    return t("market.v3.found", { n, alike: [rooms, cls, within].filter(Boolean).join(JOIN_ALIKE) });
  }
  return t(c.scope === "city" ? "market.v3.city" : "market.v3.district", { n, place: c.district ?? "" });
}

/** The conclusion after the own price, by tone; `good` and an unknown tone, and `mixed` without a place value, by sign. */
function conclusionText(c: ListingComparison, tone: string | null, delta: number, ctx: MarketTextContext): string {
  const { locale, t } = ctx;
  switch (tone) {
    case "mixed":
      if (c.place_value !== null) {
        return t("market.v3.mixed", { place: valueText(c.place_value, c, ctx) });
      }
      break;
    case "suspicious":
      return t("market.v3.suspicious");
    case "check":
      return c.note ? `${t("market.v3.check")} ${c.note}` : t("market.v3.check");
    case "same":
      return t("market.v3.same");
    case "no_repair":
      return t("market.v3.noRepair");
  }
  const how = howText(delta, locale, t);
  return delta > 0 ? t("market.v3.pricier", { how }) : t("market.v3.cheaper", { how });
}

/**
 * The three paragraphs of the market sheet (legacy `MarketSheet`); `null` without a comparison or a delta. The
 * verdict gate is the sheet's. Without an own value the own paragraph is left out (HOMI: legacy prints an empty value).
 */
export function marketParagraphs(d: Pick<ListingDetails, "comparison" | "market">, ctx: MarketTextContext): MarketParagraphs | null {
  const c = d.comparison;
  const delta = d.market.median_delta;
  if (c === null || delta === null) {
    return null;
  }
  const m2 = c.metric === "m2";
  const median = ctx.t(m2 ? "market.v3.halfM2" : "market.v3.half", { value: valueText(c.value, c, ctx) });
  const own = ownValue(c);
  return {
    sample: sampleText(c, ctx),
    median,
    own:
      own === null
        ? null
        : ctx.t(m2 ? "market.v3.ownM2" : "market.v3.own", { value: valueText(own, c, ctx) }) +
          JOIN_CONCLUSION +
          conclusionText(c, d.market.tone, delta, ctx),
  };
}

/** «обновлено 5 минут назад» of the sheet's footer; `null` without a valid time. */
export function updatedText(updated: string | null, now: number, t: Translate): string | null {
  const ago = formatAgo(updated, now, t);
  return ago === null ? null : t("market.v3.updated", { ago });
}

/** Forgets that the rooms phrase was reported; tests only. */
export function resetMarketReports(): void {
  roomsReported = false;
}
