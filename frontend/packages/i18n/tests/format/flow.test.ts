import type { Locale } from "@homi/config";
import { describe, expect, it } from "vitest";

import { flowParts, type FlowSurface, flowRate, formatFlow } from "../../src/format/index";
import { translator } from "./translate";

describe("BR-APP-044: flowRate", () => {
  it("is null unless the answer is an object with a numeric week and days > 0", () => {
    for (const flow of [
      null,
      undefined,
      "4",
      4,
      [],
      {},
      { week: 3 },
      { week: "3", days: 7 },
      { week: 3, days: "7" },
      { week: 3, days: 0 },
      { week: 3, days: -7 },
      { week: Number.NaN, days: 7 },
      { week: 3, days: Number.POSITIVE_INFINITY },
      { week: -1, days: 7 },
    ]) {
      expect(flowRate(flow), JSON.stringify(flow)).toBeNull();
    }
  });

  it("is none for an empty week, the weekly count under one a day, else the rounded daily count", () => {
    expect(flowRate({ week: 0, days: 7 })).toEqual({ kind: "none" });
    expect(flowRate({ week: 4, days: 7 })).toEqual({ kind: "week", n: 4 });
    expect(flowRate({ week: 6, days: 7 })).toEqual({ kind: "week", n: 6 });
    expect(flowRate({ week: 7, days: 7 })).toEqual({ kind: "day", n: 1 });
    expect(flowRate({ week: 10, days: 7 })).toEqual({ kind: "day", n: 1 });
    expect(flowRate({ week: 21, days: 7 })).toEqual({ kind: "day", n: 3 });
    expect(flowRate({ week: 3, days: 2 })).toEqual({ kind: "day", n: 2 });
    expect(flowRate({ week: 4, days: 7, options: [] })).toEqual({ kind: "week", n: 4 });
  });
});

const surfaces: FlowSurface[] = ["sheet", "tile", "nudge"];

/** Expected texts per locale: none, 4 in 7 days, 21 in 7 days — on the sheet, a tile and the nudge. */
const legacy: Record<Locale, Record<FlowSurface, [string, string, string]>> = {
  ru: {
    sheet: ["📡 За неделю таких не было — радар будет срабатывать редко", "📡 Радар: 4 за неделю", "📡 Радар: ≈3 в день"],
    tile: ["пока редко", "4 за неделю", "≈3 в день"],
    nudge: ["Таких пока нет — радар пришлёт, как появятся", "4 за неделю", "≈3 в день"],
  },
  uz: {
    sheet: ["📡 Bir haftada bunday eʼlon boʻlmadi — radar kam ishlaydi", "📡 Radar: haftasiga 4 ta", "📡 Radar: kuniga ≈3"],
    tile: ["hozircha kam", "Haftasiga 4", "Kuniga ≈3"],
    nudge: ["Hozircha bunday yoʻq — chiqishi bilan radar yuboradi", "Haftasiga 4", "Kuniga ≈3"],
  },
  en: {
    sheet: ["📡 None in the past week — radar will rarely go off", "📡 Radar: 4 a week", "📡 Radar: ≈3 a day"],
    tile: ["rarely so far", "4 a week", "≈3 a day"],
    nudge: ["None yet — radar will send them as they appear", "4 a week", "≈3 a day"],
  },
};

const flows = [
  { week: 0, days: 7 },
  { week: 4, days: 7 },
  { week: 21, days: 7 },
];

describe("BR-APP-044: formatFlow", () => {
  it.each(["ru", "uz", "en"] as const)("words 0, 4 and 21 per 7 days on the three surfaces (%s)", (locale) => {
    const t = translator(locale);
    for (const surface of surfaces) {
      expect(flows.map((flow) => formatFlow(flowRate(flow), surface, t))).toEqual(legacy[locale][surface]);
    }
  });

  it("is nothing without a rate", () => {
    for (const surface of surfaces) {
      expect(formatFlow(null, surface, translator("ru"))).toBeNull();
      expect(formatFlow(flowRate({ week: 4, days: 0 }), surface, translator("ru"))).toBeNull();
      expect(formatFlow(flowRate("4"), surface, translator("ru"))).toBeNull();
    }
  });
});

describe("LB-APP-033: dev021OneFlowVocabulary", () => {
  it.each(["ru", "uz", "en"] as const)("off: each surface keeps its own legacy wording (%s)", (locale) => {
    const t = translator(locale);
    for (const surface of surfaces) {
      expect(flows.map((flow) => formatFlow(flowRate(flow), surface, t, { oneVocabulary: false }))).toEqual(
        legacy[locale][surface],
      );
    }
  });

  it.each(["ru", "uz", "en"] as const)("on: every surface uses the sheet vocabulary (%s)", (locale) => {
    const t = translator(locale);
    for (const surface of surfaces) {
      expect(flows.map((flow) => formatFlow(flowRate(flow), surface, t, { oneVocabulary: true }))).toEqual(
        legacy[locale].sheet,
      );
    }
  });
});

describe("flowParts (WP-39, BR-APP-113): the flow line as a message and its number", () => {
  const surfaces: readonly FlowSurface[] = ["sheet", "tile", "nudge"];

  it("null without a rate and for none this week, whose line has no number", () => {
    expect(flowParts(null, "sheet")).toBeNull();
    expect(flowParts(flowRate({ week: 0, days: 7 }), "sheet")).toBeNull();
    expect(flowParts(flowRate({ week: 3 }), "sheet")).toBeNull();
  });

  it("the sheet's keys and the numbers of flowRate: a day rate rounded, a week rate as it is", () => {
    expect(flowParts(flowRate({ week: 21, days: 7 }), "sheet")).toEqual({ key: "sheet.flowDay", n: 3 });
    expect(flowParts(flowRate({ week: 4, days: 7 }), "sheet")).toEqual({ key: "sheet.flowWeek", n: 4 });
    expect(flowParts(flowRate({ week: 18, days: 7 }), "sheet")).toEqual({ key: "sheet.flowDay", n: 3 });
  });

  it.each(["ru", "uz", "en"] as const)("formatted with its number it equals formatFlow on every surface (%s)", (locale) => {
    const t = translator(locale);
    for (const oneVocabulary of [false, true]) {
      for (const surface of surfaces) {
        for (const flow of [{ week: 21, days: 7 }, { week: 4, days: 7 }, { week: 1, days: 30 }, { week: 700, days: 7 }]) {
          const rate = flowRate(flow);
          const parts = flowParts(rate, surface, { oneVocabulary });
          expect(parts).not.toBeNull();
          expect(t(parts!.key, { n: parts!.n })).toBe(formatFlow(rate, surface, t, { oneVocabulary }));
        }
      }
    }
  });
});
