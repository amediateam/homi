import { describe, expect, it } from "vitest";

import { ageLabel, ageText, factsLine, locationLine, priceKindLabel, priceLine } from "@/features/feed/cardText";

import { previewOf, translator } from "../helpers/listing";

const tRu = translator("ru");
const tUz = translator("uz");
const tEn = translator("en");

const price = { display: "$600", period: "/мес", alt: null, notes: [], usd: 600, kind: null };

describe("the price line (03 SCR-007, BR-API-156)", () => {
  it("is the amount and the period of the contract, without a label", () => {
    expect(priceLine(previewOf({ price }), tRu)).toEqual({ amount: "$600", period: "/мес", kind: null, negotiable: false });
    expect(priceLine(previewOf({ price: { ...price, display: "$85 000", period: null } }), tRu)).toEqual({
      amount: "$85 000",
      period: "",
      kind: null,
      negotiable: false,
    });
  });

  it("adds the label of a down payment and of a business price, in three locales", () => {
    const downPayment = previewOf({ price: { ...price, kind: "down_payment" } });
    const business = previewOf({ price: { ...price, kind: "business" } });

    expect(priceLine(downPayment, tRu).kind).toBe("первый взнос");
    expect(priceLine(downPayment, tUz).kind).toBe("boshlangʻich toʻlov");
    expect(priceLine(downPayment, tEn).kind).toBe("down payment");
    expect(priceLine(business, tRu).kind).toBe("цена за бизнес, помещение в аренде");
    expect(priceLine(business, tUz).kind).toBe("biznes narxi, joy ijarada");
    expect(priceLine(business, tEn).kind).toBe("business price, premises rented");
  });

  it("has no label for null or any other kind (Q-API-065)", () => {
    expect(priceKindLabel(null, tRu)).toBeNull();
    expect(priceKindLabel("installment", tRu)).toBeNull();
    expect(priceKindLabel("toString", tRu)).toBeNull();
  });

  it("is «Цена договорная» without a price", () => {
    expect(priceLine(previewOf({ price: null }), tRu)).toEqual({
      amount: "Цена договорная",
      period: "",
      kind: null,
      negotiable: true,
    });
    expect(priceLine(previewOf({ price: null }), tEn).amount).toBe("Price on request");
  });
});

describe("the facts line", () => {
  const base = { title: "2-комн. квартира", area_total: 54, floor: 3, floors_total: 9 };

  it("is title, area, floor of total, market and pets", () => {
    const item = previewOf({ ...base, market: { label: "Вторичка", median_delta: null, tone: null }, pets_ok: true });

    expect(factsLine(item, "ru", tRu)).toBe("2-комн. квартира · 54 м² · 3/9 эт. · Вторичка · 🐾 можно с животными");
    expect(factsLine(item, "en", tEn)).toBe("2-комн. квартира · 54 m² · floor 3/9 · Вторичка · 🐾 pets OK");
  });

  it("is the floor alone without a total, and leaves out what is unknown", () => {
    expect(factsLine(previewOf({ ...base, floors_total: null }), "ru", tRu)).toBe("2-комн. квартира · 54 м² · 3 эт.");
    expect(factsLine(previewOf({ ...base, floors_total: null }), "uz", tUz)).toBe("2-комн. квартира · 54 m² · 3-qavat");
    expect(factsLine(previewOf({ ...base, area_total: null, floor: null }), "ru", tRu)).toBe("2-комн. квартира");
    expect(factsLine(previewOf({ ...base, floor: null, area_total: 0 }), "ru", tRu)).toBe("2-комн. квартира");
  });

  it("BR-APP-110: floor 0 is «цокольный этаж» and a negative floor «подвал», without the total", () => {
    expect(factsLine(previewOf({ ...base, floor: 0 }), "ru", tRu)).toBe("2-комн. квартира · 54 м² · цокольный этаж");
    expect(factsLine(previewOf({ ...base, floor: -1 }), "ru", tRu)).toBe("2-комн. квартира · 54 м² · подвал");
    expect(factsLine(previewOf({ ...base, floor: -2, floors_total: null }), "uz", tUz)).toBe("2-комн. квартира · 54 m² · yertoʻla");
    expect(factsLine(previewOf({ ...base, floor: 0, floors_total: null }), "en", tEn)).toBe(
      "2-комн. квартира · 54 m² · semi-basement floor",
    );
    expect(factsLine(previewOf({ ...base, floor: null }), "ru", tRu)).toBe("2-комн. квартира · 54 м²");
    expect(factsLine(previewOf({ ...base, floor: 3 }), "ru", tRu)).toBe("2-комн. квартира · 54 м² · 3/9 эт.");
    expect(factsLine(previewOf({ ...base, floor: 3, floors_total: null }), "ru", tRu)).toBe("2-комн. квартира · 54 м² · 3 эт.");
  });

  it("rounds the area", () => {
    expect(factsLine(previewOf({ ...base, area_total: 54.6, floor: null }), "ru", tRu)).toBe("2-комн. квартира · 55 м²");
  });
});

describe("the age", () => {
  it("is posted.when, the part legacy shows after « · » (BR-API-072)", () => {
    expect(ageText(previewOf({ posted: { label: "Опубликовано", when: "сегодня", at: null } }))).toBe("сегодня");
    expect(ageText(previewOf({ posted: { label: "Обновлено", when: "3 дня назад", at: null } }))).toBe("3 дня назад");
  });

  it("falls back to posted.label without a when, and is null without either", () => {
    expect(ageText(previewOf({ posted: { label: "вчера", when: "", at: null } }))).toBe("вчера");
    expect(ageText(previewOf({ posted: { label: "", when: "", at: null } }))).toBeNull();
  });
});

describe("BR-APP-109: the computed age", () => {
  const AT = "2026-11-14T06:40:00+00:00";
  const at = Date.parse(AT);
  const posted = (value: string | null) => previewOf({ posted: { label: "Опубликовано", when: "сегодня", at: value } });
  const after = (ms: number, t = tRu) => ageLabel(posted(AT), at + ms, t);
  const MIN = 60_000;

  it("reads the values of legacy's parity scenario feed-age: 20 s, 5 min, 3 h, 50 h", () => {
    expect(after(20_000)).toBe("только что");
    expect(after(5 * MIN)).toBe("5 мин назад");
    expect(after(3 * 60 * MIN)).toBe("3 ч назад");
    expect(after(50 * 60 * MIN)).toBe("2 дн. назад");
  });

  it("changes form at 1, 60 and 1 440 minutes, and has no week or month", () => {
    expect(after(MIN - 1)).toBe("только что");
    expect(after(MIN)).toBe("1 мин назад");
    expect(after(59 * MIN)).toBe("59 мин назад");
    expect(after(60 * MIN)).toBe("1 ч назад");
    expect(after(1_439 * MIN)).toBe("23 ч назад");
    expect(after(1_440 * MIN)).toBe("1 дн. назад");
    expect(after(400 * 1_440 * MIN)).toBe("400 дн. назад");
  });

  it("is in the locale of `t`", () => {
    expect(after(5 * MIN, tUz)).toBe("5 daqiqa oldin");
    expect(after(5 * MIN, tEn)).toBe("5 min ago");
    expect(after(50 * 60 * MIN, tEn)).toBe("2 d ago");
  });

  it("reads a `posted.at` in the future as «только что»", () => {
    expect(after(-3 * 60 * MIN)).toBe("только что");
  });

  it("is the server's string without a parsable `at`, and while the clock is unknown (`now === null`)", () => {
    expect(ageLabel(posted(null), at, tRu)).toBe("сегодня");
    expect(ageLabel(posted(""), at, tRu)).toBe("сегодня");
    expect(ageLabel(posted("вчера"), at, tRu)).toBe("сегодня");
    expect(ageLabel(posted(AT), null, tRu)).toBe("сегодня");
    expect(ageLabel(previewOf({ posted: { label: "", when: "", at: null } }), at, tRu)).toBeNull();
  });
});

describe("BR-APP-030: the location line", () => {
  const place = { district: { code: "yunusobod", name: "Юнусабад" }, landmark: "Мегапланет", center_km: 4.2 };

  it("ends with the metro within 1.5 km", () => {
    expect(locationLine(previewOf({ ...place, metro: { name: "Минор", km: 0.7 } }), "ru", tRu)).toBe(
      "Юнусабад · Мегапланет · Минор · 700 м",
    );
    expect(locationLine(previewOf({ ...place, metro: { name: "Минор", km: 0.04 } }), "ru", tRu)).toBe(
      "Юнусабад · Мегапланет · Минор",
    );
  });

  it("ends with the distance to the centre, one decimal, without a metro or beyond 1.5 km", () => {
    expect(locationLine(previewOf({ ...place, metro: null }), "ru", tRu)).toBe("Юнусабад · Мегапланет · 4,2 км до центра");
    expect(locationLine(previewOf({ ...place, metro: { name: "Минор", km: 1.6 } }), "en", tEn)).toBe(
      "Юнусабад · Мегапланет · 4.2 km to the centre",
    );
    expect(locationLine(previewOf({ ...place, metro: null, center_km: 3 }), "uz", tUz)).toBe(
      "Юнусабад · Мегапланет · Markazgacha 3,0 km",
    );
  });

  it("leaves out each missing part, and is null with none", () => {
    expect(locationLine(previewOf({ ...place, metro: null, center_km: null }), "ru", tRu)).toBe("Юнусабад · Мегапланет");
    expect(locationLine(previewOf({ district: null, landmark: null, metro: null, center_km: 4.2 }), "ru", tRu)).toBe(
      "4,2 км до центра",
    );
    expect(locationLine(previewOf({ district: null, landmark: null, metro: null, center_km: null }), "ru", tRu)).toBeNull();
  });

  it("DEV-019 on: the metro distance in the one distance formatter", () => {
    const item = previewOf({ ...place, metro: { name: "Минор", km: 1.2 } });
    expect(locationLine(item, "ru", tRu, { oneFormatter: true })).toBe("Юнусабад · Мегапланет · Минор · 1,2 км");
  });
});
