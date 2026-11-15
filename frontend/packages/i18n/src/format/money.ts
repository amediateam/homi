import type { Locale } from "@homi/config";

import { type I18nReporter, reportOnce } from "../report";
import { formatDecimal, formatNumber, type Translate } from "./number";

/** The deals a price preset list exists for (`03` §3.5). */
export type PresetDeal = "rent_long" | "rent_daily" | "sale";

export type MoneyOptions = {
  locale: Locale;
  /** The display currency of the user (`me.currency`); only `UZS` switches the display to сум. */
  currency: string | null | undefined;
  /** Сум per dollar from the reference data; missing, zero or invalid keeps the display in USD. */
  usdUzs: number | null | undefined;
  t: Translate;
  /** Told once per kind of problem when an amount cannot be shown (negative, not finite). */
  report?: I18nReporter;
};

export type PricePreset = { usd: number; label: string };

/** USD presets of the filters' city (`presets[deal]` of its statistics) and of the reference data. */
export type PresetSources = {
  city?: readonly number[] | null;
  reference?: readonly number[] | null;
};

export type Money = {
  /** Currency `UZS` **and** a rate greater than 0 (BR-APP-060). */
  readonly isUzs: boolean;
  /** `$1 200`; «850 000 сум», «1,5 млн сум», «1,5 млрд сум»; an amount that cannot be shown gives `""`. */
  format(usd: number): string;
  /** The unit next to a price input: «млн сум» or `$`. */
  unitLabel(): string;
  /** A price input's text: the USD integer, or millions of сум with one decimal; `""` for no value. */
  toInput(usd: number | null): string;
  /** A price input's text back to whole USD; `null` for empty, zero or not a number. */
  parseInput(text: string): number | null;
  /** Preset chips of a deal (BR-APP-014, BR-APP-015). */
  presets(deal: PresetDeal, sources: PresetSources): PricePreset[];
};

const MILLION = 1_000_000;

/** UZS presets from city presets are rounded to these steps, in сум (BR-APP-015). */
const PRESET_STEP: Record<PresetDeal, number> = {
  rent_long: 500_000,
  rent_daily: 100_000,
  sale: 50_000_000,
};

/** UZS presets without city presets, in сум: rent 3 … 15 млн, daily 0.3 … 1.5 млн, sale 500 … 3 000 млн. */
const FIXED_PRESETS: Record<PresetDeal, readonly number[]> = {
  rent_long: [3_000_000, 4_000_000, 5_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000],
  rent_daily: [300_000, 500_000, 700_000, 1_000_000, 1_500_000],
  sale: [500_000_000, 700_000_000, 1_000_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000],
};

/**
 * Money of the Mini App (BR-APP-060, `03` §3.5): prices are stored and sent in USD and shown in USD or сум.
 * A new instance is made when the currency or the rate changes.
 *
 * Fix of LB-APP-011: an amount is rounded to the precision of its unit before the unit is chosen, so 999 500 сум
 * reads «1 млн сум» and 999 950 000 сум «1 млрд сум»; inputs accept the thousands separators of every locale.
 */
export function createMoney({ locale, currency, usdUzs, t, report }: MoneyOptions): Money {
  const rate = typeof usdUzs === "number" && Number.isFinite(usdUzs) && usdUzs > 0 ? usdUzs : 0;
  const isUzs = currency === "UZS" && rate > 0;

  const showable = (usd: number): boolean => {
    if (typeof usd !== "number" || !Number.isFinite(usd)) {
      reportOnce(report, "money:non-finite", new Error("A non-finite amount cannot be shown"), {
        kind: "i18n",
        key: null,
        code: "NON_FINITE_AMOUNT",
      });
      return false;
    }
    if (usd < 0) {
      reportOnce(report, "money:negative", new Error("A negative amount cannot be shown"), {
        kind: "i18n",
        key: null,
        code: "NEGATIVE_AMOUNT",
      });
      return false;
    }
    return true;
  };

  const formatSum = (sum: number): string => {
    const thousands = Math.round(sum / 1_000) * 1_000;
    if (thousands < MILLION) {
      return t("money.uzs", { amount: formatNumber(thousands, locale) });
    }
    const millions = Math.round(sum / 100_000) / 10;
    if (millions < 1_000) {
      return t("money.mln", { value: formatDecimal(millions, locale) });
    }
    return t("money.bln", { value: formatDecimal(Math.round(sum / 100_000_000) / 10, locale) });
  };

  const formatUsd = (usd: number): string => `$${formatNumber(usd, locale)}`;

  const usable = (list: readonly number[] | null | undefined): number[] =>
    (list ?? []).filter((usd) => showable(usd) && usd > 0);

  return {
    isUzs,
    format(usd) {
      if (!showable(usd)) {
        return "";
      }
      return isUzs ? formatSum(usd * rate) : formatUsd(usd);
    },
    unitLabel() {
      return isUzs ? t("money.unitMln") : "$";
    },
    toInput(usd) {
      if (usd === null || !showable(usd)) {
        return "";
      }
      return isUzs ? formatDecimal((usd * rate) / MILLION, locale) : String(usd);
    },
    parseInput(text) {
      const value = parseAmount(text);
      if (value === null) {
        return null;
      }
      if (isUzs) {
        return Math.max(1, Math.round((value * MILLION) / rate));
      }
      const usd = Math.round(value);
      return usd > 0 ? usd : null;
    },
    presets(deal, { city, reference }) {
      const cityPresets = usable(city);
      if (!isUzs) {
        const list = cityPresets.length > 0 ? cityPresets : usable(reference);
        return list.map((usd) => ({ usd, label: formatUsd(usd) }));
      }
      const step = PRESET_STEP[deal];
      const sums =
        cityPresets.length > 0
          ? [...new Set(cityPresets.map((usd) => Math.max(step, Math.round((usd * rate) / step) * step)))]
          : FIXED_PRESETS[deal];
      return sums.map((sum) => ({ usd: Math.round(sum / rate), label: formatSum(sum) }));
    },
  };
}

/**
 * A typed amount as a positive number, or `null` (fix of LB-APP-011). Spaces of every kind are dropped. The last
 * `,` or `.` is the decimal mark when it is the only one of its kind and one or two digits follow it; every other
 * separator groups thousands: `1.000.000` → 1 000 000, `1,2` → 1.2, `1,500` → 1 500, `1.234,5` → 1 234.5.
 */
function parseAmount(text: string): number | null {
  const compact = text.replace(/\s/g, "");
  if (!/^[\d.,]*\d[\d.,]*$/.test(compact)) {
    return null;
  }
  const last = Math.max(compact.lastIndexOf(","), compact.lastIndexOf("."));
  const fraction = compact.slice(last + 1);
  const decimal = last >= 0 && compact.indexOf(compact[last]) === last && /^\d{1,2}$/.test(fraction);
  const digits = decimal
    ? `${compact.slice(0, last).replace(/[.,]/g, "")}.${fraction}`
    : compact.replace(/[.,]/g, "");
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}
