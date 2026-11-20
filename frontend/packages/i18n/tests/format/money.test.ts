import type { Locale } from "@homi/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMoney, type MoneyOptions } from "../../src/format/index";
import { resetI18nReports } from "../../src/index";
import { ru, translator } from "./translate";

afterEach(() => resetI18nReports());

const locales: Locale[] = ["ru", "uz", "en"];

function money(locale: Locale, currency: string | null, usdUzs: number | null | undefined, extra: Partial<MoneyOptions> = {}) {
  return createMoney({ locale, currency, usdUzs, t: translator(locale), ...extra });
}

/** One rate of 1 сум per dollar, so the amount is the сум amount itself. */
const uzs = (locale: Locale) => money(locale, "UZS", 1);

describe("BR-APP-060: price display", () => {
  it("USD is `$` and the rounded integer in the number locale", () => {
    expect(money("ru", "USD", 12650).format(1200)).toBe(ru("$1_200"));
    expect(money("uz", "USD", 12650).format(1200)).toBe(ru("$1_200"));
    expect(money("en", "USD", 12650).format(1200)).toBe("$1,200");
    expect(money("ru", "USD", 12650).format(599.5)).toBe("$600");
  });

  const table: Array<[number, string, string, string]> = [
    [850_400, ru("850_000 сум"), ru("850_000 soʻm"), "850,000 UZS"],
    [999_499, ru("999_000 сум"), ru("999_000 soʻm"), "999,000 UZS"],
    [1_000_000, "1 млн сум", "1 mln soʻm", "1M UZS"],
    [1_250_000, "1,3 млн сум", "1,3 mln soʻm", "1.3M UZS"],
    [350_000_000, "350 млн сум", "350 mln soʻm", "350M UZS"],
    [999_940_000, "999,9 млн сум", "999,9 mln soʻm", "999.9M UZS"],
    [1_500_000_000, "1,5 млрд сум", "1,5 mlrd soʻm", "1.5B UZS"],
    [12_000_000_000, "12 млрд сум", "12 mlrd soʻm", "12B UZS"],
  ];

  it.each(table)("UZS %d сум reads %s / %s / %s", (amount, inRu, inUz, inEn) => {
    expect(uzs("ru").format(amount)).toBe(inRu);
    expect(uzs("uz").format(amount)).toBe(inUz);
    expect(uzs("en").format(amount)).toBe(inEn);
  });

  it("converts USD at the rate", () => {
    expect(money("ru", "UZS", 12650).format(100)).toBe("1,3 млн сум");
    expect(money("ru", "UZS", 12650).format(67)).toBe(ru("848_000 сум"));
  });

  it("shows USD when the currency is UZS but the rate is missing, zero, negative or not a number", () => {
    for (const rate of [undefined, null, 0, -12650, Number.NaN, Number.POSITIVE_INFINITY]) {
      const instance = money("ru", "UZS", rate);
      expect(instance.isUzs, String(rate)).toBe(false);
      expect(instance.format(1200)).toBe(ru("$1_200"));
    }
  });

  it("shows USD for any currency other than UZS", () => {
    for (const currency of ["USD", "EUR", null]) {
      expect(money("ru", currency, 12650).isUzs).toBe(false);
      expect(money("ru", currency, 12650).format(1200)).toBe(ru("$1_200"));
    }
    expect(money("ru", "UZS", 12650).isUzs).toBe(true);
  });

  it("formats a negative or non-finite amount to an empty string and reports it once", () => {
    const report = vi.fn();
    const instance = money("ru", "USD", 12650, { report });

    expect(instance.format(-5)).toBe("");
    expect(instance.format(-7)).toBe("");
    expect(instance.format(Number.NaN)).toBe("");
    expect(instance.format(Number.POSITIVE_INFINITY)).toBe("");
    expect(money("ru", "UZS", 12650, { report }).format(Number.NaN)).toBe("");

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.map(([, issue]) => issue)).toEqual([
      { kind: "i18n", key: null, code: "NEGATIVE_AMOUNT" },
      { kind: "i18n", key: null, code: "NON_FINITE_AMOUNT" },
    ]);
  });
});

describe("LB-APP-011: the UZS unit is chosen after rounding", () => {
  it.each([999_500, 999_700, 999_999])("%d сум reads «1 млн сум», not «1 000 000 сум»", (amount) => {
    expect(uzs("ru").format(amount)).toBe("1 млн сум");
    expect(uzs("uz").format(amount)).toBe("1 mln soʻm");
    expect(uzs("en").format(amount)).toBe("1M UZS");
  });

  it("999 950 000 сум reads «1 млрд сум», not «1 000 млн сум»", () => {
    expect(uzs("ru").format(999_950_000)).toBe("1 млрд сум");
    expect(uzs("uz").format(999_950_000)).toBe("1 mlrd soʻm");
    expect(uzs("en").format(999_950_000)).toBe("1B UZS");
  });
});

describe("unitLabel", () => {
  it("is millions of сум in UZS and `$` otherwise", () => {
    expect(money("ru", "UZS", 12650).unitLabel()).toBe("млн сум");
    expect(money("uz", "UZS", 12650).unitLabel()).toBe("mln soʻm");
    expect(money("en", "UZS", 12650).unitLabel()).toBe("M UZS");
    expect(money("ru", "USD", 12650).unitLabel()).toBe("$");
    expect(money("ru", "UZS", 0).unitLabel()).toBe("$");
  });
});

describe("toInput", () => {
  it("is the integer in USD and millions of сум with one decimal and no grouping in UZS (`03` §3.5)", () => {
    expect(money("ru", "USD", 12650).toInput(1200)).toBe("1200");
    expect(money("ru", "UZS", 12650).toInput(100)).toBe("1,3");
    expect(money("uz", "UZS", 12650).toInput(100)).toBe("1,3");
    expect(money("en", "UZS", 12650).toInput(100)).toBe("1.3");
    expect(money("ru", "UZS", 12650).toInput(118_577)).toBe("1500");
    expect(money("uz", "UZS", 12650).toInput(118_577)).toBe("1500");
    expect(money("en", "UZS", 12650).toInput(118_577)).toBe("1500");
    expect(money("ru", "UZS", 10_000).toInput(150_050)).toBe("1500,5");
    expect(money("en", "UZS", 10_000).toInput(150_050)).toBe("1500.5");
  });

  it("1 500,5 млн сум reads back as the same value", () => {
    const sum = money("ru", "UZS", 10_000);
    expect(sum.parseInput("1500,5")).toBe(150_050);
    expect(sum.toInput(sum.parseInput("1500,5"))).toBe("1500,5");
    expect(money("en", "UZS", 10_000).parseInput("1500.5")).toBe(150_050);
  });

  it("is empty for no value and for an amount that cannot be shown", () => {
    expect(money("ru", "USD", 12650).toInput(null)).toBe("");
    expect(money("ru", "USD", 12650).toInput(Number.NaN)).toBe("");
    expect(money("ru", "UZS", 12650).toInput(-1)).toBe("");
  });

  it("survives its own parse in every locale and currency", () => {
    for (const locale of locales) {
      for (const instance of [money(locale, "USD", 12650), money(locale, "UZS", 12650)]) {
        for (const usd of [40, 100, 600, 1200, 118_577, 1_500_000]) {
          const text = instance.toInput(usd);
          expect(instance.toInput(instance.parseInput(text)), `${locale} ${text}`).toBe(text);
        }
      }
    }
  });
});

describe("parseInput", () => {
  const usd = money("ru", "USD", 12650);
  const sum = money("ru", "UZS", 12650);

  it("LB-APP-011: repeated separators are thousands, `1.000.000` is a million", () => {
    expect(usd.parseInput("1.000.000")).toBe(1_000_000);
    expect(usd.parseInput("1,000,000")).toBe(1_000_000);
    expect(usd.parseInput("1.000.50")).toBe(100_050);
  });

  it("LB-APP-011: one `,` or `.` followed by one or two digits is the decimal mark", () => {
    expect(sum.parseInput("1,2")).toBe(95);
    expect(sum.parseInput("1.2")).toBe(95);
    expect(usd.parseInput("12,50")).toBe(13);
    expect(usd.parseInput("1.234,5")).toBe(1235);
    expect(usd.parseInput("1,234.5")).toBe(1235);
  });

  it("LB-APP-011: one separator followed by three digits is a thousands separator", () => {
    expect(usd.parseInput("1,500")).toBe(1500);
    expect(usd.parseInput("0,001")).toBe(1);
    expect(sum.parseInput("1,500")).toBe(118_577);
  });

  it("strips spaces of every kind", () => {
    expect(usd.parseInput("85 000")).toBe(85_000);
    expect(usd.parseInput("1 200")).toBe(1200);
    expect(usd.parseInput("1 200")).toBe(1200);
    expect(usd.parseInput(" 1 200 ")).toBe(1200);
    expect(sum.parseInput(ru("1_500"))).toBe(118_577);
  });

  it("a dollar amount may carry one `$` before or after it (`03` §3.5); a сум amount may not", () => {
    for (const text of ["$1200", "$1 200", "1 200 $", "1200$", "$1,200", " $ 1 200 "]) {
      expect(usd.parseInput(text), JSON.stringify(text)).toBe(1200);
      expect(sum.parseInput(text), JSON.stringify(text)).toBeNull();
    }
    for (const text of ["$1 200 $", "$$1200", "1$200", "$"]) {
      expect(usd.parseInput(text), JSON.stringify(text)).toBeNull();
    }
  });

  it("reads zero, empty text and non-numbers as no value", () => {
    for (const text of ["0", "0,0", "", "   ", "abc", ",", ".", "12abc", "-5", "1e5", "$0"]) {
      expect(usd.parseInput(text), JSON.stringify(text)).toBeNull();
      expect(sum.parseInput(text), JSON.stringify(text)).toBeNull();
    }
    expect(usd.parseInput("0,4")).toBeNull();
  });

  it("converts UZS millions with max(1, round(value · 10⁶ / rate))", () => {
    expect(sum.parseInput("1,5")).toBe(119);
    expect(money("ru", "UZS", 30_000).parseInput("0,01")).toBe(1);
  });
});

describe("BR-APP-015: price presets", () => {
  it("in USD are the city presets, else the reference presets, labelled `$N`", () => {
    const instance = money("ru", "USD", 12650);

    expect(instance.presets("rent_long", { city: [300, 1500], reference: [400] })).toEqual([
      { usd: 300, label: "$300" },
      { usd: 1500, label: ru("$1_500") },
    ]);
    expect(instance.presets("rent_long", { city: [], reference: [400] })).toEqual([{ usd: 400, label: "$400" }]);
    expect(instance.presets("rent_long", { reference: [400] })).toEqual([{ usd: 400, label: "$400" }]);
    expect(instance.presets("sale", {})).toEqual([]);
  });

  it("in UZS convert the city presets and round them to 0.5 млн for rent, dropping duplicates", () => {
    expect(money("ru", "UZS", 12650).presets("rent_long", { city: [300, 310, 350, 400, 1000, 1], reference: [9] })).toEqual([
      { usd: 316, label: "4 млн сум" },
      { usd: 356, label: "4,5 млн сум" },
      { usd: 395, label: "5 млн сум" },
      { usd: 988, label: "12,5 млн сум" },
      { usd: 40, label: ru("500_000 сум") },
    ]);
  });

  it("in UZS round city presets to 0.1 млн for daily rent and to 50 млн for sale", () => {
    expect(money("ru", "UZS", 12650).presets("rent_daily", { city: [20, 25, 40] })).toEqual([
      { usd: 24, label: ru("300_000 сум") },
      { usd: 40, label: ru("500_000 сум") },
    ]);
    expect(money("ru", "UZS", 12650).presets("sale", { city: [50_000, 52_000, 100_000] })).toEqual([
      { usd: 51_383, label: "650 млн сум" },
      { usd: 98_814, label: "1,3 млрд сум" },
    ]);
  });

  it("in UZS without city presets use the fixed lists and ignore the reference presets", () => {
    const instance = money("ru", "UZS", 12650);
    const labels = (deal: "rent_long" | "rent_daily" | "sale") =>
      instance.presets(deal, { city: [], reference: [123] }).map((preset) => preset.label);

    expect(labels("rent_long")).toEqual([
      "3 млн сум",
      "4 млн сум",
      "5 млн сум",
      "6 млн сум",
      "8 млн сум",
      "10 млн сум",
      "15 млн сум",
    ]);
    expect(labels("rent_daily")).toEqual([
      ru("300_000 сум"),
      ru("500_000 сум"),
      ru("700_000 сум"),
      "1 млн сум",
      "1,5 млн сум",
    ]);
    expect(labels("sale")).toEqual([
      "500 млн сум",
      "700 млн сум",
      "1 млрд сум",
      "1,5 млрд сум",
      "2 млрд сум",
      "3 млрд сум",
    ]);
    expect(instance.presets("rent_long", {}).map((preset) => preset.usd)).toEqual([237, 316, 395, 474, 632, 791, 1186]);
  });

  it("are labelled in the locale", () => {
    expect(money("uz", "UZS", 12650).presets("rent_daily", {}).map((preset) => preset.label)).toEqual([
      ru("300_000 soʻm"),
      ru("500_000 soʻm"),
      ru("700_000 soʻm"),
      "1 mln soʻm",
      "1,5 mln soʻm",
    ]);
    expect(money("en", "UZS", 12650).presets("sale", {}).map((preset) => preset.label)).toEqual([
      "500M UZS",
      "700M UZS",
      "1B UZS",
      "1.5B UZS",
      "2B UZS",
      "3B UZS",
    ]);
    expect(money("en", "USD", 12650).presets("sale", { city: [85_000] })).toEqual([{ usd: 85_000, label: "$85,000" }]);
  });

  it("skip a negative or non-finite city preset", () => {
    expect(money("ru", "USD", 12650).presets("rent_long", { city: [Number.NaN, -300, 300] })).toEqual([
      { usd: 300, label: "$300" },
    ]);
    expect(money("ru", "UZS", 12650).presets("rent_long", { city: [Number.NaN, -300, 300] })).toEqual([
      { usd: 316, label: "4 млн сум" },
    ]);
  });
});
