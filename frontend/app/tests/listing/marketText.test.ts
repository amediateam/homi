import { createMoney } from "@homi/i18n/format";
import { beforeEach, describe, expect, it } from "vitest";

import type { ListingComparison, ListingDetails } from "@/features/listing/listingData";
import {
  classParam,
  contextLine,
  howText,
  JOIN_ALIKE,
  JOIN_CONCLUSION,
  markerPosition,
  marketParagraphs,
  marketTitleKey,
  type MarketTextContext,
  ownValue,
  radiusText,
  resetMarketReports,
  roomsParam,
  roomsPhrase,
  showsMarket,
  unitKey,
  updatedText,
  valueText,
} from "@/features/listing/market/marketText";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";

import { detailsOf } from "../helpers/details";
import { translator } from "../helpers/listing";

/** The no-break space the catalogue puts before «м», «км» and the dash of «половина — дороже». */
const NB = " ";

const tRu = translator("ru");
const tEn = translator("en");
const ru: MarketTextContext = { locale: "ru", t: tRu, money: createMoney({ locale: "ru", currency: "USD", usdUzs: 12_800, t: tRu }) };
const en: MarketTextContext = { locale: "en", t: tEn, money: createMoney({ locale: "en", currency: "USD", usdUzs: 12_800, t: tEn }) };

/** 100001's comparison (district, month, rooms 2, n 14) with `overrides` on top. */
function comparison(overrides: Partial<ListingComparison> = {}): ListingComparison {
  return { ...(detailsOf().comparison as ListingComparison), ...overrides };
}

/** The details the texts read: `comparison`, `deal` and `market`. */
function details(c: Partial<ListingComparison> | null, market: Partial<ListingDetails["market"]> = {}, deal: ListingDetails["deal"] = "rent_long") {
  const base = detailsOf();
  return { ...base, deal, comparison: c === null ? null : comparison(c), market: { ...base.market, ...market } };
}

beforeEach(() => {
  resetMarketReports();
  clearRecentErrors();
});

describe("the scale of the market block (BR-APP-028)", () => {
  it("places the marker at clamp(4, 96, 50 + delta / 0.4 × 50)", () => {
    expect(markerPosition(-0.6)).toBe(4);
    expect(markerPosition(0)).toBe(50);
    expect(markerPosition(0.2)).toBe(75);
    expect(markerPosition(0.5)).toBe(96);
    expect(markerPosition(-0.12)).toBe(35);
  });

  it("takes the own value, else the per-m² or the dollar price by metric", () => {
    expect(ownValue(comparison())).toBe(600);
    expect(ownValue(comparison({ own: null, metric: "m2", price_per_m2: 11.1, price_usd: 600 }))).toBe(11.1);
    expect(ownValue(comparison({ own: null, metric: "month", price_per_m2: 11.1, price_usd: 640 }))).toBe(640);
    expect(ownValue(comparison({ own: null, metric: "month", price_usd: null }))).toBeNull();
  });

  it("shows only with a verdict, a comparison and a delta (D-4)", () => {
    expect(showsMarket(details({}), true)).toBe(true);
    expect(showsMarket(details({}), false)).toBe(false);
    expect(showsMarket(details(null), true)).toBe(false);
    expect(showsMarket(details({}, { median_delta: null }), true)).toBe(false);
  });

  it("titles by scope and units by metric and reason", () => {
    expect(marketTitleKey("near")).toBe("market.titleNear");
    expect(marketTitleKey("city")).toBe("market.titleCity");
    expect(marketTitleKey("district")).toBe("market.title");
    expect(marketTitleKey(null)).toBe("market.title");

    expect(unitKey({ metric: "m2", has_reason: true })).toBe("unit.m2Month");
    expect(unitKey({ metric: "m2", has_reason: false })).toBe("unit.m2");
    expect(unitKey({ metric: "month", has_reason: true })).toBe("unit.month");
    expect(unitKey({ metric: "person", has_reason: false })).toBe("unit.month");
    expect(unitKey({ metric: null, has_reason: false })).toBe("unit.month");
  });
});

describe("the context line", () => {
  it("fills {rooms} with nothing, 1…3 or 4+, and {cls} with the class words", () => {
    expect([null, 0, -1, 1, 2, 3, 4, 7, 2.5].map(roomsParam)).toEqual(["", "", "", "1", "2", "3", "4+", "4+", "3"]);
    expect(classParam("jk", tRu)).toBe(" в ЖК");
    expect(classParam("house", tRu)).toBe(" в обычных домах");
    expect(classParam("tower", tRu)).toBe("");
    expect(classParam(null, tRu)).toBe("");
  });

  it("district, and its sale form", () => {
    expect(contextLine(details({}), ru)).toBe("2-комн. · район Юнусабад · 14 объявл.");
    expect(contextLine(details({}, {}, "sale"), ru)).toBe("Район Юнусабад · за м² · 14 объявл.");
    expect(contextLine(details({ rooms: 5, n: null }), ru)).toBe("4+-комн. · район Юнусабад · 0 объявл.");
  });

  it("near: count, rooms, class and the radius in km with one decimal; sale per m²", () => {
    const near = { scope: "near", rooms: 2, near_class: "jk", radius_km: 0.34, n: 9, district: "Чирчик" };
    expect(contextLine(details(near), ru)).toBe("9 ближайших 2-комн. в ЖК · до 0,3 км");
    expect(contextLine(details({ ...near, near_class: "house", radius_km: 1.26 }, {}, "sale"), ru)).toBe("9 ближайших квартир в обычных домах · до 1,3 км · за м²");
    expect(contextLine(details({ ...near, near_class: null }), en)).toBe("9 nearest 2-room · within 0.3 km");
  });

  it("person, per m² with a reason, city", () => {
    expect(contextLine(details({ metric: "person" }), ru)).toBe("Место при подселении · район Юнусабад · 14 объявл.");
    expect(contextLine(details({ metric: "m2", has_reason: true }), ru)).toBe("За м² · квартиры от 3 комнат · Юнусабад");
    expect(contextLine(details({ metric: "m2", has_reason: false }), ru)).toBe("2-комн. · район Юнусабад · 14 объявл.");
    const city = { scope: "city", district: "Чирчик", n: 31 };
    expect(contextLine(details(city), ru)).toBe("2-комн. · город Чирчик · 31 объявл.");
    expect(contextLine(details(city, {}, "sale"), ru)).toBe("Город Чирчик · за м² · 31 объявл.");
  });

  it("a mixed tone with a place value appends the district price", () => {
    expect(contextLine(details({ place_value: 700 }, { tone: "mixed" }), ru)).toBe("2-комн. · район Юнусабад · 14 объявл. · по району $700");
    expect(contextLine(details({ place_value: null }, { tone: "mixed" }), ru)).toBe("2-комн. · район Юнусабад · 14 объявл.");
    expect(contextLine(details({ place_value: 700 }, { tone: "good" }), ru)).toBe("2-комн. · район Юнусабад · 14 объявл.");
  });

  it("is null without a comparison", () => {
    expect(contextLine(details(null), ru)).toBeNull();
  });
});

describe("the pieces of the market sheet (legacy)", () => {
  it("rooms phrase: a total function (LB-APP-015)", () => {
    expect(roomsPhrase(0, tRu)).toBe("тоже студии");
    expect(roomsPhrase(1, tRu)).toBe("тоже однокомнатные");
    expect(roomsPhrase(2, tRu)).toBe("тоже двухкомнатные");
    expect(roomsPhrase(3, tRu)).toBe("тоже трёхкомнатные");
    expect(roomsPhrase(4, tRu)).toBe("тоже от 4 комнат");
    expect(roomsPhrase(7, tRu)).toBe("тоже от 4 комнат");
    expect(roomsPhrase(null, tRu)).toBeNull();
    expect(recentErrors()).toEqual([]);

    expect(roomsPhrase(2.5, tRu)).toBe("тоже 3-комн.");
  });

  it("an unexpected rooms value is reported once per launch, without the value", () => {
    roomsPhrase(2.5, tRu);
    roomsPhrase(-1, tRu);

    expect(recentErrors()).toHaveLength(1);
    expect(recentErrors()[0].error.message).toBe("comparison.rooms");
    expect(recentErrors()[0].context).toEqual({ kind: "error", where: "market.rooms" });

    resetMarketReports();
    roomsPhrase(1.5, tRu);
    expect(recentErrors()).toHaveLength(2);
  });

  it("radius: hundreds of metres under 1 km, at least 100; else km with one decimal", () => {
    expect(radiusText(0.05, "ru", tRu)).toBe(`100${NB}м`);
    expect(radiusText(0.34, "ru", tRu)).toBe(`300${NB}м`);
    expect(radiusText(null, "ru", tRu)).toBe(`100${NB}м`);
    expect(radiusText(0, "ru", tRu)).toBe(`100${NB}м`);
    // The legacy quirk, inherited: 0.95–0.999 km rounds to ten hundreds, ungrouped.
    expect(radiusText(0.97, "ru", tRu)).toBe(`1000${NB}м`);
    expect(radiusText(1.26, "ru", tRu)).toBe(`1,3${NB}км`);
    expect(radiusText(1.26, "en", tEn)).toBe(`1.3${NB}km`);
    expect(radiusText(1, "uz", translator("uz"))).toBe(`1,0${NB}km`);
  });

  it("{how}: «в N раза» from +90 % in the number locale, else the rounded percent", () => {
    expect(howText(0.95, "ru", tRu)).toBe("в 2 раза");
    expect(howText(1.26, "ru", tRu)).toBe("в 2,3 раза");
    expect(howText(0.9, "ru", tRu)).toBe("в 1,9 раза");
    expect(howText(0.89, "ru", tRu)).toBe("на 89%");
    expect(howText(-0.12, "ru", tRu)).toBe("на 12%");
    expect(howText(1.26, "en", tEn)).toBe("2.3 times");
    expect(howText(-0.12, "en", tEn)).toBe("12%");
  });

  it("values: the money, wrapped per m² (a month with a reason)", () => {
    expect(valueText(672, { metric: "month", has_reason: false }, ru)).toBe("$672");
    expect(valueText(12.6, { metric: "m2", has_reason: false }, ru)).toBe("$13 за м²");
    expect(valueText(12.6, { metric: "m2", has_reason: true }, ru)).toBe("$13 за м² в месяц");
    expect(valueText(12.6, { metric: "m2", has_reason: true }, en)).toBe("$13 per m² a month");
  });

  it("the joiners are comma-space and space-dash-space", () => {
    expect(JOIN_ALIKE).toBe(", ");
    expect(JOIN_CONCLUSION).toBe(" — ");
  });
});

describe("marketParagraphs", () => {
  it("district: sample, median and own with its conclusion", () => {
    expect(marketParagraphs(details({}), ru)).toEqual({
      sample: "Рядом мало похожих квартир, поэтому сравнили со всем районом Юнусабад: 14 объявлений.",
      median: `Половина из них дешевле $672, половина${NB}— дороже.`,
      own: "Эта стоит $600 — на 12% дешевле.",
    });
  });

  it("near: the alike phrases joined by «, », the within phrase always", () => {
    const near = { scope: "near", rooms: 2, near_class: "jk", radius_km: 0.34, n: 12 };
    expect(marketParagraphs(details(near), ru)?.sample).toBe(`Мы нашли 12 похожих квартир рядом: тоже двухкомнатные, тоже в ЖК, не дальше 300${NB}м.`);
    // No class phrase without a known class; a per-m² comparison has no rooms phrase, even with rooms set.
    expect(marketParagraphs(details({ ...near, near_class: null }), ru)?.sample).toBe(`Мы нашли 12 похожих квартир рядом: тоже двухкомнатные, не дальше 300${NB}м.`);
    expect(marketParagraphs(details({ ...near, metric: "m2", near_class: "house" }), ru)?.sample).toBe(`Мы нашли 12 похожих квартир рядом: тоже в обычном доме, не дальше 300${NB}м.`);
    expect(marketParagraphs(details({ ...near, metric: "m2", near_class: null, n: null, radius_km: 1.26 }), ru)?.sample).toBe(`Мы нашли 0 похожих квартир рядом: не дальше 1,3${NB}км.`);
    expect(marketParagraphs(details({ ...near, n: 1, rooms: null, near_class: null }), en)?.sample).toBe(`We found 1 similar flat nearby: within 300${NB}m.`);
  });

  it("city: the city of the comparison", () => {
    expect(marketParagraphs(details({ scope: "city", district: "Чирчик", n: 31 }), ru)?.sample).toBe(
      "Район не указан, поэтому сравнили со всем городом Чирчик: 31 объявление.",
    );
    expect(marketParagraphs(details({ scope: "city", district: null, n: 2 }), ru)?.sample).toBe("Район не указан, поэтому сравнили со всем городом : 2 объявления.");
  });

  it("per m²: the median and own values carry the per-m² wrapper", () => {
    const m2 = { metric: "m2", has_reason: true, value: 15, own: 12, price_per_m2: 12 };
    expect(marketParagraphs(details(m2), ru)).toMatchObject({
      median: `Сравниваем цену за метр: у половины из них дешевле $15 за м² в месяц, у половины${NB}— дороже.`,
      own: "Здесь $12 за м² в месяц — на 12% дешевле.",
    });
  });

  it("concludes by tone; check and its note are joined by one space", () => {
    const own = (market: Partial<ListingDetails["market"]>, c: Partial<ListingComparison> = {}) => marketParagraphs(details(c, market), ru)?.own;

    expect(own({ tone: "suspicious", median_delta: -0.5 })).toBe("Эта стоит $600 — сильно дешевле, чем у всех рядом. Уточните цену у продавца и не платите заранее.");
    expect(own({ tone: "check", median_delta: 0.11 }, { note: "Цена выше похожих рядом — уточните условия" })).toBe(
      "Эта стоит $600 — очень далеко от цен рядом — уточните её у продавца. Цена выше похожих рядом — уточните условия",
    );
    expect(own({ tone: "check", median_delta: 0.11 })).toBe("Эта стоит $600 — очень далеко от цен рядом — уточните её у продавца.");
    expect(own({ tone: "same", median_delta: 0.02 })).toBe("Эта стоит $600 — почти столько же.");
    expect(own({ tone: "no_repair", median_delta: -0.2 })).toBe(
      "Эта стоит $600 — дешевле соседей, но квартира без ремонта или под ремонт — такие обычно и стоят дешевле, поэтому «дешевле рынка» мы не пишем.",
    );
    expect(own({ tone: "high", median_delta: 1.26 })).toBe("Эта стоит $600 — в 2,3 раза дороже.");
    expect(own({ tone: "weird", median_delta: 0.3 })).toBe("Эта стоит $600 — на 30% дороже.");
    expect(own({ tone: "good", median_delta: 0 })).toBe("Эта стоит $600 — на 0% дешевле.");
  });

  it("mixed: the place value in the same wrapper; without one it concludes by the sign", () => {
    expect(marketParagraphs(details({ place_value: 700 }, { tone: "mixed", median_delta: -0.15 }), ru)?.own).toBe(
      "Эта стоит $600 — дешевле соседей. Но по всему району такие квартиры обычно стоят $700, поэтому «дешевле рынка» мы не пишем.",
    );
    expect(marketParagraphs(details({ metric: "m2", has_reason: false, own: 12, place_value: 14.2 }, { tone: "mixed", median_delta: -0.15 }), ru)?.own).toBe(
      "Здесь $12 за м² — дешевле соседей. Но по всему району такие квартиры обычно стоят $14 за м², поэтому «дешевле рынка» мы не пишем.",
    );
    expect(marketParagraphs(details({ place_value: null }, { tone: "mixed", median_delta: -0.15 }), ru)?.own).toBe("Эта стоит $600 — на 15% дешевле.");
  });

  it("without an own value the own paragraph is left out, the other two stay", () => {
    expect(marketParagraphs(details({ own: null, price_usd: null }), ru)).toEqual({
      sample: "Рядом мало похожих квартир, поэтому сравнили со всем районом Юнусабад: 14 объявлений.",
      median: `Половина из них дешевле $672, половина${NB}— дороже.`,
      own: null,
    });
  });

  it("is null without a comparison or a delta", () => {
    expect(marketParagraphs(details(null), ru)).toBeNull();
    expect(marketParagraphs(details({}, { median_delta: null }), ru)).toBeNull();
  });
});

describe("updatedText", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const before = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it("wraps the age: just now, minutes, hours under 48, then days; a future time is now", () => {
    expect(updatedText(before(1), now, tRu)).toBe("обновлено только что");
    expect(updatedText(before(5), now, tRu)).toBe("обновлено 5 минут назад");
    expect(updatedText(before(180), now, tRu)).toBe("обновлено 3 часа назад");
    expect(updatedText(before(49 * 60), now, tRu)).toBe("обновлено 2 дня назад");
    expect(updatedText(before(-10), now, tRu)).toBe("обновлено только что");
    expect(updatedText(before(5), now, tEn)).toBe("updated 5 minutes ago");
  });

  it("is null without a valid time", () => {
    expect(updatedText(null, now, tRu)).toBeNull();
    expect(updatedText("", now, tRu)).toBeNull();
    expect(updatedText("not a date", now, tRu)).toBeNull();
  });
});
