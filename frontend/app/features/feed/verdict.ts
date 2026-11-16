import type { Locale } from "@homi/config";
import { labelTables } from "@homi/i18n";
import { formatDecimal, type Translate } from "@homi/i18n/format";

import { labelFor } from "@/i18n/labels";

import type { ListingPreview } from "./types";

/** The market fields a verdict reads; the preview and the full card (WP-26) both carry them. */
export type MarketFields = Pick<ListingPreview["market"], "median_delta" | "tone">;

/** A tone of `labelTables.verdictTone` (`03` BR-APP-027, with `high`, which legacy draws as `.delta.high`). */
export type KnownTone = keyof (typeof labelTables)["verdictTone"];

/** `neutral` is the drawing of a tone the client does not know (fix of LB-APP-039). */
export type VerdictTone = KnownTone | "neutral";

export interface Verdict {
  tone: VerdictTone;
  /** The long wording, e.g. «На 12% дешевле рынка». */
  text: string;
  /** «−12%», «+40%», or the word of `same` and `mixed`. */
  short: string;
}

/** «В {x} раза дороже рынка» from +90 % (BR-APP-027). */
const TIMES_FROM = 0.9;

/** A minus sign (U+2212), as legacy writes it. */
const MINUS = "−";

function isKnownTone(tone: string): tone is KnownTone {
  return Object.hasOwn(labelTables.verdictTone, tone);
}

/**
 * The tone of a listing's verdict, or `null` when there is none (no delta or no tone, BR-APP-027). The badge reads
 * it too (BR-APP-026), so a `good` tone without a delta gives neither a chip nor «Ниже рынка», as legacy.
 */
export function verdictToneOf(market: MarketFields): VerdictTone | null {
  if (market.median_delta === null || !market.tone) {
    return null;
  }
  return isKnownTone(market.tone) ? market.tone : "neutral";
}

/** `fmt.marketTimes` above +90 %, else `fmt.marketPricier`: the "pricier" wording of `high` and of an unknown tone. */
function pricier(delta: number, pct: number, locale: Locale, t: Translate): string {
  if (delta >= TIMES_FROM) {
    return t("fmt.marketTimes", { x: formatDecimal(Math.round((1 + delta) * 10) / 10, locale) });
  }
  return t("fmt.marketPricier", { pct });
}

/**
 * The market verdict of a listing (BR-APP-027): percentages are `round(|delta| · 100)`; `check` reads below or above
 * the market by the sign; `high` reads "pricier", «В {x} раза дороже рынка» from +90 %. Fix of LB-APP-039: an unknown
 * tone reads "cheaper" below zero and "pricier" otherwise, in the neutral tone, and every percentage label carries
 * the real sign (legacy wrote «+N%» for any unknown tone).
 */
export function marketVerdict(item: { market: MarketFields }, locale: Locale, t: Translate): Verdict | null {
  const tone = verdictToneOf(item.market);
  const delta = item.market.median_delta;
  if (tone === null || delta === null) {
    return null;
  }
  const pct = Math.round(Math.abs(delta) * 100);
  const short = delta < 0 ? `${MINUS}${pct}%` : `+${pct}%`;
  switch (tone) {
    case "same":
      return { tone, text: t(labelFor("verdictTone", tone)), short: t("fmt.marketSameShort") };
    case "mixed":
      return { tone, text: t(labelFor("verdictTone", tone), { pct }), short: t("fmt.marketMixedShort") };
    case "check":
      return { tone, text: t(delta < 0 ? "fmt.marketCheck" : "fmt.marketCheckHigh", { pct }), short };
    case "high":
      return { tone, text: pricier(delta, pct, locale, t), short };
    case "neutral":
      return { tone, text: delta < 0 ? t("fmt.marketCheaper", { pct }) : pricier(delta, pct, locale, t), short };
    default:
      return { tone, text: t(labelFor("verdictTone", tone), { pct }), short };
  }
}

/**
 * The market chip of the full card and of the listing's price bar: the word of `same` and `mixed` as it is, else
 * «{delta} к рынку» (`listing.marketDelta`). The compact card shows `verdict.short` alone (`03` SCR-007).
 */
export function marketChipText(verdict: Verdict, t: Translate): string {
  if (verdict.tone === "same" || verdict.tone === "mixed") {
    return verdict.short;
  }
  return t("listing.marketDelta", { delta: verdict.short });
}
