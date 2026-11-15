import { describe, expect, it } from "vitest";

import { defaultFilters } from "../src/defaults";
import {
  areaLabel,
  filtersAreaSummary,
  filtersSummary,
  filtersTitle,
  findCity,
  priceLabel,
  roomsLabel,
  type SummaryContext,
} from "../src/summary";
import type { SearchFilters } from "../src/types";
import { cities, LOCALES, type TestLocale, tashkent, translator, usd } from "./support";

const ctx = (locale: TestLocale = "ru", withCities = true): SummaryContext => ({
  t: translator(locale),
  formatPrice: usd,
  cities: withCities ? cities(locale) : null,
});

const triangle = [
  [41.3, 69.2],
  [41.31, 69.25],
  [41.29, 69.3],
] as const;

const yunusabad: SearchFilters = {
  ...defaultFilters("rent_long", "tashkent"),
  districts: ["yunusabad"],
  near_metro: true,
  rooms_min: 2,
  rooms_max: 2,
  price_max: 600,
  owner: "no_agents",
};

const dailyMix: SearchFilters = {
  ...defaultFilters("rent_daily", "tashkent"),
  types: ["house", "room"],
  zones: ["center", "near_center"],
  rooms_min: 1,
  rooms_max: 3,
  price_min: 40,
  price_max: 80,
  below_median: true,
  owner: "owners",
};

describe("roomsLabel", () => {
  const t = translator("ru");
  const rooms = (rooms_min: number | null, rooms_max: number | null) => roomsLabel({ rooms_min, rooms_max }, { t });

  it("BR-APP-066 «{n}-комн.», «{n}+ комн.», «{lo}–{hi} комн.», nothing when unset", () => {
    expect(rooms(2, 2)).toBe("2-комн.");
    expect(rooms(4, null)).toBe("4+ комн.");
    expect(rooms(2, null)).toBe("2+ комн.");
    expect(rooms(1, 3)).toBe("1–3 комн.");
    expect(rooms(null, 3)).toBe("1–3 комн.");
    expect(rooms(null, null)).toBeNull();
  });
});

describe("priceLabel", () => {
  const price = (price_min: number | null, price_max: number | null) =>
    priceLabel({ price_min, price_max }, { t: translator("ru"), formatPrice: usd });

  it("BR-APP-066 «до X», «от X», «X–Y», nothing when unset", () => {
    expect(price(null, 600)).toBe("до $600");
    expect(price(100, null)).toBe("от $100");
    expect(price(100, 600)).toBe("$100–$600");
    expect(price(null, null)).toBeNull();
  });

  it("BR-APP-066 uses the money formatter it is given", () => {
    expect(priceLabel({ price_min: null, price_max: 600 }, { t: translator("ru"), formatPrice: () => "7,6 млн сум" })).toBe(
      "до 7,6 млн сум",
    );
  });
});

describe("areaLabel", () => {
  const t = translator("ru");
  const area = (over: Partial<SearchFilters>) => areaLabel({ ...defaultFilters(), ...over }, tashkent(), { t });

  it("BR-APP-064 a drawn area, both zones, one zone without its note, two districts and +N", () => {
    expect(area({ polygon: triangle })).toBe("Своя область");
    expect(area({ zones: ["center", "near_center"] })).toBe("Центр и ближе к центру");
    expect(area({ zones: ["center"] })).toBe("Центр");
    expect(area({ zones: ["near_center"] })).toBe("Ближе к центру");
    expect(area({ districts: ["yunusabad"] })).toBe("Юнусабадский");
    expect(area({ districts: ["yunusabad", "chilanzar"] })).toBe("Юнусабадский, Чиланзарский");
    expect(area({ districts: ["yunusabad", "chilanzar", "mirabad", "sergeli"] })).toBe("Юнусабадский, Чиланзарский +2");
    expect(area({})).toBeNull();
  });

  it("BR-APP-064 the polygon wins over zones a server radar also carries", () => {
    expect(area({ polygon: triangle, zones: ["center"] })).toBe("Своя область");
  });

  it("BR-APP-064 an unknown district shows by its code; without city data a zone shows nothing", () => {
    expect(area({ districts: ["old_code"] })).toBe("old_code");
    expect(areaLabel({ ...defaultFilters(), zones: ["center"] }, null, { t })).toBeNull();
    expect(areaLabel({ ...defaultFilters(), districts: ["yunusabad"] }, null, { t })).toBe("yunusabad");
  });
});

describe("filtersSummary", () => {
  it("BR-APP-064 ru: city · area · у метро · rooms · price · без риелторов", () => {
    expect(filtersSummary(yunusabad, ctx("ru"))).toBe(
      "Ташкент · Юнусабадский · у метро · 2-комн. · до $600 · без риелторов",
    );
  });

  it("BR-APP-064 ru: Посуточно after the area, ≤ медианы before the owner", () => {
    expect(filtersSummary(dailyMix, ctx("ru"))).toBe(
      "Ташкент · Центр и ближе к центру · Посуточно · 1–3 комн. · $40–$80 · ≤ медианы · от хозяев",
    );
  });

  it("BR-APP-064 ru: every part at once, in the legacy order", () => {
    const all = { ...dailyMix, zones: [], districts: ["yunusabad"], near_metro: true } as SearchFilters;
    expect(filtersSummary(all, ctx("ru"))).toBe(
      "Ташкент · Юнусабадский · Посуточно · у метро · 1–3 комн. · $40–$80 · ≤ медианы · от хозяев",
    );
  });

  it("BR-APP-064 snapshots in ru, uz and en", () => {
    expect(LOCALES.map((locale) => filtersSummary(yunusabad, ctx(locale)))).toEqual([
      "Ташкент · Юнусабадский · у метро · 2-комн. · до $600 · без риелторов",
      "Toshkent · Yunusobod · metro yonida · 2-xonali · $600 gacha · maklersiz",
      "Tashkent · Yunusabad · near metro · 2-room · up to $600 · no agents",
    ]);
    expect(LOCALES.map((locale) => filtersSummary(dailyMix, ctx(locale)))).toEqual([
      "Ташкент · Центр и ближе к центру · Посуточно · 1–3 комн. · $40–$80 · ≤ медианы · от хозяев",
      "Toshkent · Markaz va yaqinroq · Kunlik · 1–3 xonali · $40–$80 · ≤ mediana · uy egalaridan",
      "Tashkent · Centre and near it · Daily · 1–3 rooms · $40–$80 · ≤ median · from owners",
    ]);
  });

  it("BR-APP-064 the whole city shows the city's name alone", () => {
    expect(filtersSummary(defaultFilters("rent_long", "fergana"), ctx("ru"))).toBe("Фергана");
    expect(filtersSummary({ ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: null }, ctx("ru"))).toBe(
      "Ташкент · 3+ комн.",
    );
  });

  it("LB-APP-026 before the reference data loads the city part is left out, never «Весь Ташкент»", () => {
    // Legacy printed `sum.wholeCity` («Весь Ташкент») for every city here (the collapsed title before meta loads).
    expect(filtersSummary(defaultFilters("rent_daily", "fergana"), ctx("ru", false))).toBe("Посуточно");
    expect(filtersSummary(defaultFilters("rent_long", "fergana"), ctx("ru", false))).toBe("");
    expect(filtersSummary({ ...yunusabad, districts: [] }, ctx("ru", false))).toBe(
      "у метро · 2-комн. · до $600 · без риелторов",
    );
    expect(filtersSummary(yunusabad, ctx("ru", false))).toBe("yunusabad · у метро · 2-комн. · до $600 · без риелторов");
  });

  it("LB-APP-026 a city missing from the reference data is not replaced by the first city", () => {
    // Legacy `findCity` fell back to `meta.cities[0]`, printing «Ташкент» for a Samarkand search.
    expect(filtersSummary(defaultFilters("rent_daily", "samarkand"), ctx("ru"))).toBe("Посуточно");
  });
});

describe("filtersAreaSummary", () => {
  it("BR-APP-064 the area, у метро, ≤ медианы and the owner", () => {
    expect(filtersAreaSummary({ ...yunusabad, below_median: true }, ctx("ru"))).toBe(
      "Юнусабадский · у метро · ≤ медианы · без риелторов",
    );
    expect(filtersAreaSummary(dailyMix, ctx("ru"))).toBe("Центр и ближе к центру · ≤ медианы · от хозяев");
  });

  it("LB-APP-026 the whole city reads «{city} целиком» with the city's own name in ru, uz and en", () => {
    // Legacy printed the bare name here, and «Весь Ташкент» for every city when the name was unknown.
    const whole = (code: string) =>
      LOCALES.map((locale) => filtersAreaSummary(defaultFilters("rent_long", code), ctx(locale)));
    expect(whole("tashkent")).toEqual(["Ташкент целиком", "Butun Toshkent", "All of Tashkent"]);
    expect(whole("fergana")).toEqual(["Фергана целиком", "Butun Fargʻona", "All of Fergana"]);
    expect(filtersAreaSummary({ ...defaultFilters("rent_long", "fergana"), owner: "owners" }, ctx("ru"))).toBe(
      "Фергана целиком · от хозяев",
    );
  });

  it("LB-APP-026 without a city name the whole-city part is absent", () => {
    for (const locale of LOCALES) {
      expect(filtersAreaSummary(defaultFilters("rent_long", "fergana"), ctx(locale, false))).toBe("");
    }
    expect(filtersAreaSummary({ ...defaultFilters(), near_metro: true }, ctx("ru", false))).toBe("у метро");
    const unnamed = { ...ctx("ru"), cities: [{ code: "tashkent" }] };
    expect(filtersAreaSummary(defaultFilters("rent_long", "tashkent"), unnamed)).toBe("");
  });

  it("LB-APP-026 the legacy «Весь Ташкент» wording is printed for no other city and for no unknown name", () => {
    // uz and en of the new label equal the legacy text for Tashkent itself, so the samples are other cities.
    const legacy = ["Весь Ташкент", "Butun Toshkent", "All of Tashkent"];
    const samples = [defaultFilters("rent_long", "fergana"), defaultFilters("rent_daily", "samarkand"), yunusabad];
    for (const locale of LOCALES) {
      for (const withCities of [true, false]) {
        for (const filters of samples) {
          const context = ctx(locale, withCities);
          const lines = [filtersSummary(filters, context), filtersAreaSummary(filters, context)];
          for (const line of lines) {
            for (const wording of legacy) {
              expect(line).not.toContain(wording);
            }
          }
        }
      }
    }
  });
});

describe("filtersTitle", () => {
  const radar: SearchFilters = {
    ...defaultFilters("rent_daily", "tashkent"),
    types: ["house", "room"],
    rooms_min: 1,
    rooms_max: 3,
    price_min: 40,
  };

  it("BR-APP-065 deal · types · rooms · price", () => {
    expect(filtersTitle(radar, ctx("ru"))).toBe("Посуточно · Дом, Комната · 1–3 комн. · от $40");
  });

  it("BR-APP-065 no deal for long rent, no types for apartments only", () => {
    expect(filtersTitle({ ...defaultFilters(), rooms_min: 2, rooms_max: 2 }, ctx("ru"))).toBe("2-комн.");
    expect(filtersTitle({ ...defaultFilters("sale"), price_max: 90000 }, ctx("ru"))).toBe("Продажа · до $90000");
  });

  it("BR-APP-065 empty → the deal name", () => {
    expect(filtersTitle(defaultFilters(), ctx("ru"))).toBe("Аренда");
    expect(filtersTitle(defaultFilters("sale"), ctx("ru"))).toBe("Продажа");
    expect(filtersTitle(defaultFilters("rent_daily"), ctx("ru"))).toBe("Посуточно");
  });

  it("BR-APP-065 snapshots in ru, uz and en", () => {
    expect(LOCALES.map((locale) => filtersTitle(radar, ctx(locale)))).toEqual([
      "Посуточно · Дом, Комната · 1–3 комн. · от $40",
      "Kunlik · Uy, Xona · 1–3 xonali · $40 dan",
      "Daily · House, Room · 1–3 rooms · from $40",
    ]);
    expect(LOCALES.map((locale) => filtersTitle(defaultFilters(), ctx(locale)))).toEqual(["Аренда", "Ijara", "Rent"]);
  });

  it("an unknown type of a server-stored radar gives the fallback label", () => {
    const stored = { ...defaultFilters(), types: ["apartment", "garage"] };
    expect(filtersTitle(stored, ctx("ru"))).toBe("Квартира, Другое");
    expect(filtersTitle(stored, ctx("en"))).toBe("Apartment, Other");
  });

  it("an injected label lookup (labelFor of @homi/i18n) replaces the built-in table", () => {
    const seen: string[] = [];
    const label = (table: "type" | "deal", value: string) => {
      seen.push(`${table}:${value}`);
      return value === "garage" ? "fallback.other" : `${table}.${value}`;
    };
    const stored = { ...defaultFilters("sale"), types: ["garage"] };
    expect(filtersTitle(stored, { ...ctx("ru"), label })).toBe("Продажа · Другое");
    expect(seen).toEqual(["deal:sale", "type:garage"]);
  });
});

describe("findCity", () => {
  it("finds a city by its code only, never another one", () => {
    expect(findCity(cities("ru"), "fergana")?.name).toBe("Фергана");
    expect(findCity(cities("ru"), "samarkand")).toBeNull();
    expect(findCity(null, "tashkent")).toBeNull();
    expect(findCity(undefined, "tashkent")).toBeNull();
  });
});
