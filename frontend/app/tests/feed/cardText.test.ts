import { describe, expect, it } from "vitest";

import { ageText, factsLine, locationLine, priceKindLabel, priceLine } from "@/features/feed/cardText";

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
    expect(factsLine(previewOf({ ...base, floor: 0, area_total: 0 }), "ru", tRu)).toBe("2-комн. квартира");
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
