import type { Locale } from "@homi/config";
import { resetI18nReports } from "@homi/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RadarMode } from "@/features/radars/normalize";
import { radarStatus } from "@/features/radars/radarStatus";

import { translator } from "../helpers/listing";

const on = (mode: RadarMode = "instant") => ({ active: true, mode });
const status = (radar: { active: boolean; mode: RadarMode }, flow: unknown, locale: Locale = "ru", oneVocabulary = false) =>
  radarStatus(radar, flow, { t: translator(locale), locale, oneVocabulary });

beforeEach(() => {
  resetI18nReports();
});

describe("radarStatus (SCR-026, SCR-028, BR-APP-044)", () => {
  it("a paused radar reads «На паузе», whatever its flow", () => {
    expect(status({ active: false, mode: "instant" }, { week: 21, days: 7 })).toBe("На паузе");
    expect(status({ active: false, mode: "digest" }, null, "en")).toBe("Paused");
  });

  it("without a flow: the mode alone, in lower case", () => {
    expect(status(on("instant"), null)).toBe("сразу");
    expect(status(on("digest"), undefined)).toBe("подборкой");
    // A flow that is not an object with a numeric week and a positive days shows no flow part.
    expect(status(on("instant"), { week: 3, days: 0 })).toBe("сразу");
    expect(status(on("instant"), { week: "3", days: 7 })).toBe("сразу");
  });

  it("week 0 → «пока редко · …»", () => {
    expect(status(on("instant"), { week: 0, days: 7 })).toBe("пока редко · сразу");
  });

  it("under one a day → «{n} за неделю · …»", () => {
    expect(status(on("digest"), { week: 3, days: 7 })).toBe("3 за неделю · подборкой");
  });

  it("one a day or more → «≈{n} в день · …», rounded", () => {
    expect(status(on("instant"), { week: 21, days: 7 })).toBe("≈3 в день · сразу");
    expect(status(on("instant"), { week: 25, days: 7 })).toBe("≈4 в день · сразу");
  });

  it("an unknown mode reads the label table's default, in lower case, reported once, and never throws", () => {
    const report = vi.fn();
    const weekly = { active: true, mode: "weekly" as RadarMode };

    expect(radarStatus(weekly, null, { t: translator("ru"), locale: "ru", report })).toBe("другое");
    expect(radarStatus(weekly, { week: 21, days: 7 }, { t: translator("ru"), locale: "ru", report })).toBe("≈3 в день · другое");
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("lower-cases the mode by the locale's rules in uz and en", () => {
    expect(status(on("instant"), null, "uz")).toBe("darhol");
    expect(status(on("digest"), { week: 3, days: 7 }, "uz")).toBe("Haftasiga 3 · toʻplam");
    expect(status(on("digest"), { week: 21, days: 7 }, "en")).toBe("≈3 a day · as a digest");
  });

  it("dev021OneFlowVocabulary on: the sheet's flow words on the tile too (LB-APP-033)", () => {
    expect(status(on("instant"), { week: 0, days: 7 }, "ru", true)).toBe("📡 За неделю таких не было — радар будет срабатывать редко · сразу");
    expect(status(on("instant"), { week: 3, days: 7 }, "ru", true)).toBe("📡 Радар: 3 за неделю · сразу");
    expect(status(on("instant"), { week: 21, days: 7 }, "ru", true)).toBe("📡 Радар: ≈3 в день · сразу");
    // Off (the default): the tile's own words.
    expect(status(on("instant"), { week: 3, days: 7 }, "ru", false)).toBe("3 за неделю · сразу");
  });
});
