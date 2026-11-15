import { describe, expect, it } from "vitest";

import { formatCenter, formatDistance, formatMetroLabel } from "../../src/format/index";
import { ru, translator } from "./translate";

const tRu = translator("ru");
const tUz = translator("uz");
const tEn = translator("en");

describe("BR-APP-029: formatMetroLabel", () => {
  it("is the name only under 50 m", () => {
    expect(formatMetroLabel("Чиланзар", 0, "ru", tRu)).toBe("Чиланзар");
    expect(formatMetroLabel("Чиланзар", 0.04, "ru", tRu)).toBe("Чиланзар");
    expect(formatMetroLabel("Chilonzor", 0.04, "uz", tUz)).toBe("Chilonzor");
  });

  it("is «{metro} · {m} м» with metres rounded to 100 up to 1.5 km", () => {
    expect(formatMetroLabel("Чиланзар", 0.05, "ru", tRu)).toBe("Чиланзар · 100 м");
    expect(formatMetroLabel("Чиланзар", 0.83, "ru", tRu)).toBe("Чиланзар · 800 м");
    expect(formatMetroLabel("Чиланзар", 1.2, "ru", tRu)).toBe(ru("Чиланзар · 1_200 м"));
    expect(formatMetroLabel("Чиланзар", 1.5, "ru", tRu)).toBe(ru("Чиланзар · 1_500 м"));
    expect(formatMetroLabel("Chilonzor", 0.83, "uz", tUz)).toBe("Chilonzor · 800 m");
    expect(formatMetroLabel("Chilanzar", 0.83, "en", tEn)).toBe("Chilanzar · 800 m");
    expect(formatMetroLabel("Chilanzar", 1.5, "en", tEn)).toBe("Chilanzar · 1,500 m");
  });

  it("is nothing beyond 1.5 km, without a name or without a distance", () => {
    expect(formatMetroLabel("Чиланзар", 1.6, "ru", tRu)).toBeNull();
    expect(formatMetroLabel("Чиланзар", 1.5001, "ru", tRu)).toBeNull();
    expect(formatMetroLabel("Чиланзар", null, "ru", tRu)).toBeNull();
    expect(formatMetroLabel("Чиланзар", undefined, "ru", tRu)).toBeNull();
    expect(formatMetroLabel("Чиланзар", Number.NaN, "ru", tRu)).toBeNull();
    expect(formatMetroLabel("Чиланзар", -0.2, "ru", tRu)).toBeNull();
    expect(formatMetroLabel("", 0.5, "ru", tRu)).toBeNull();
    expect(formatMetroLabel(null, 0.5, "ru", tRu)).toBeNull();
  });
});

describe("LB-APP-031: dev019OneDistanceFormatter", () => {
  it("off: the metro label keeps metres up to 1.5 km and the name only under 50 m, as legacy", () => {
    const off = { oneFormatter: false };

    expect(formatMetroLabel("Чиланзар", 0.08, "ru", tRu, off)).toBe("Чиланзар · 100 м");
    expect(formatMetroLabel("Чиланзар", 0.95, "ru", tRu, off)).toBe(ru("Чиланзар · 1_000 м"));
    expect(formatMetroLabel("Чиланзар", 1.2, "ru", tRu, off)).toBe(ru("Чиланзар · 1_200 м"));
  });

  it("on: the metro label uses the thresholds of formatDistance and keeps the 1.5 km cap", () => {
    const on = { oneFormatter: true };

    expect(formatMetroLabel("Чиланзар", 0.04, "ru", tRu, on)).toBe("Чиланзар");
    expect(formatMetroLabel("Чиланзар", 0.08, "ru", tRu, on)).toBe("Чиланзар");
    expect(formatMetroLabel("Чиланзар", 0.1, "ru", tRu, on)).toBe("Чиланзар · 100 м");
    expect(formatMetroLabel("Чиланзар", 0.83, "ru", tRu, on)).toBe("Чиланзар · 800 м");
    expect(formatMetroLabel("Чиланзар", 0.95, "ru", tRu, on)).toBe("Чиланзар · 1,0 км");
    expect(formatMetroLabel("Чиланзар", 1.2, "ru", tRu, on)).toBe("Чиланзар · 1,2 км");
    expect(formatMetroLabel("Chilonzor", 1.2, "uz", tUz, on)).toBe("Chilonzor · 1,2 km");
    expect(formatMetroLabel("Chilanzar", 1.2, "en", tEn, on)).toBe("Chilanzar · 1.2 km");
    expect(formatMetroLabel("Чиланзар", 1.6, "ru", tRu, on)).toBeNull();
  });
});

describe("BR-APP-031: formatDistance", () => {
  it("is «рядом» under 100 m, without the approximate mark", () => {
    expect(formatDistance(0.08, "ru", tRu)).toBe("рядом");
    expect(formatDistance(0.08, "ru", tRu, { approx: true })).toBe("рядом");
    expect(formatDistance(0, "uz", tUz)).toBe("yonida");
    expect(formatDistance(0.08, "en", tEn)).toBe("close by");
  });

  it("is metres rounded to 100 under 0.95 km", () => {
    expect(formatDistance(0.1, "ru", tRu)).toBe("100 м");
    expect(formatDistance(0.83, "ru", tRu)).toBe("800 м");
    expect(formatDistance(0.949, "ru", tRu)).toBe("900 м");
    expect(formatDistance(0.83, "uz", tUz)).toBe("800 m");
    expect(formatDistance(0.83, "en", tEn, { approx: true })).toBe("~800 m");
  });

  it("is kilometres with one decimal in the locale's mark from 0.95 km, `~` when approximate", () => {
    expect(formatDistance(0.95, "ru", tRu)).toBe("1,0 км");
    expect(formatDistance(1.26, "ru", tRu)).toBe("1,3 км");
    expect(formatDistance(1.26, "ru", tRu, { approx: true })).toBe("~1,3 км");
    expect(formatDistance(1.26, "uz", tUz, { approx: true })).toBe("~1,3 km");
    expect(formatDistance(1.26, "en", tEn, { approx: true })).toBe("~1.3 km");
    expect(formatDistance(12.34, "ru", tRu)).toBe("12,3 км");
  });

  it("is nothing for a missing, negative or non-finite distance", () => {
    for (const km of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(formatDistance(km, "ru", tRu)).toBeNull();
    }
  });
});

describe("formatCenter", () => {
  it("is «{km} км до центра» with one decimal", () => {
    expect(formatCenter(3.4, "ru", tRu)).toBe("3,4 км до центра");
    expect(formatCenter(3, "ru", tRu)).toBe("3,0 км до центра");
    expect(formatCenter(3.4, "uz", tUz)).toBe("Markazgacha 3,4 km");
    expect(formatCenter(3.4, "en", tEn)).toBe("3.4 km to the centre");
  });

  it("is nothing for a missing, negative or non-finite distance", () => {
    for (const km of [null, undefined, Number.NaN, -1]) {
      expect(formatCenter(km, "ru", tRu)).toBeNull();
    }
  });
});
