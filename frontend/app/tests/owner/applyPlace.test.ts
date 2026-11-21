import { describe, expect, it } from "vitest";

import { normalizeForm } from "@/features/owner/normalize";
import { placeFill } from "@/features/owner/place/applyPlace";
import { roundForLabel } from "@/features/owner/place/usePlaceLabel";

import { cityOf } from "../helpers/reference";

const TASHKENT = cityOf({ districts: [{ code: "yunusabad", name: "Юнусабад" }, { code: "chilanzar", name: "Чиланзар" }] });
const SAMARKAND = cityOf({ code: "samarkand", name: "Самарканд", districts: [{ code: "center", name: "Центр" }] });
const findCity = (code: string | null | undefined) => [TASHKENT, SAMARKAND].find((city) => city.code === code) ?? null;

describe("placeFill (WP-81, BR-APP-078)", () => {
  it("fills empty fields silently", () => {
    expect(placeFill(normalizeForm({}), { city: "tashkent", district_code: "yunusabad" }, findCity)).toEqual({
      fill: { city: "tashkent", district_code: "yunusabad" },
      replaced: {},
      before: {},
    });
  });

  it("replaces fields that held another value and keeps them for «Вернуть»", () => {
    const form = normalizeForm({ city: "tashkent", district_code: "chilanzar", landmark: "Мегапланет" });
    expect(placeFill(form, { city: "tashkent", district_code: "yunusabad" }, findCity)).toEqual({
      fill: {},
      replaced: { district_code: "yunusabad" },
      before: { district_code: "chilanzar" },
    });
  });

  it("the city counts as empty when the district and the landmark were both empty", () => {
    const form = normalizeForm({ city: "tashkent" });
    expect(placeFill(form, { city: "samarkand", district_code: "center" }, findCity)?.fill).toEqual({ city: "samarkand", district_code: "center" });
  });

  it("another city with a district set replaces both; another city's district never stays", () => {
    const form = normalizeForm({ city: "tashkent", district_code: "chilanzar" });
    expect(placeFill(form, { city: "samarkand", district_code: null }, findCity)).toEqual({
      fill: {},
      replaced: { city: "samarkand", district_code: null },
      before: { city: "tashkent", district_code: "chilanzar" },
    });
  });

  it("ignores a city the reference data does not know, and an answer that changes nothing", () => {
    expect(placeFill(normalizeForm({}), { city: "atlantis", district_code: null }, findCity)).toBeNull();
    expect(placeFill(normalizeForm({ city: "tashkent", district_code: "yunusabad" }), { city: "tashkent", district_code: "yunusabad" }, findCity)).toBeNull();
  });
});

describe("roundForLabel (default (f))", () => {
  it("reads the centre at 3 decimals", () => {
    expect(roundForLabel({ lat: 41.311081, lon: 69.240562 })).toEqual({ lat: 41.311, lon: 69.241 });
  });
});
