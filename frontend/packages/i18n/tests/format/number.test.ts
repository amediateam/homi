import { describe, expect, it } from "vitest";

import { formatCount, formatDecimal, formatKm, formatNumber } from "../../src/format/index";
import { ru, translator } from "./translate";

describe("formatNumber", () => {
  it("rounds to an integer with the Russian separators for ru and uz and en-GB for en", () => {
    expect(formatNumber(1234.6, "ru")).toBe(ru("1_235"));
    expect(formatNumber(1234.6, "uz")).toBe(ru("1_235"));
    expect(formatNumber(1234.6, "en")).toBe("1,235");
    expect(formatNumber(12, "ru")).toBe("12");
  });
});

describe("formatDecimal", () => {
  it("keeps at most one fraction digit with the locale's decimal mark", () => {
    expect(formatDecimal(1.25, "ru")).toBe("1,3");
    expect(formatDecimal(1.25, "uz")).toBe("1,3");
    expect(formatDecimal(1.25, "en")).toBe("1.3");
    expect(formatDecimal(2, "ru")).toBe("2");
    expect(formatDecimal(1500.04, "ru")).toBe(ru("1_500"));
    expect(formatDecimal(1500.04, "en")).toBe("1,500");
  });
});

describe("formatKm", () => {
  it("writes exactly one fraction digit with the locale's decimal mark", () => {
    expect(formatKm(1.26, "ru")).toBe("1,3");
    expect(formatKm(1.26, "uz")).toBe("1,3");
    expect(formatKm(1.26, "en")).toBe("1.3");
    expect(formatKm(3, "ru")).toBe("3,0");
  });
});

describe("formatCount", () => {
  it("writes the number in the number locale and the counted noun of the plural key", () => {
    expect(formatCount(1, "listings", "ru", translator("ru"))).toBe("1 объявление");
    expect(formatCount(5, "listings", "ru", translator("ru"))).toBe("5 объявлений");
    expect(formatCount(1234, "listings", "ru", translator("ru"))).toBe(ru("1_234 объявления"));
    expect(formatCount(1234, "listings", "uz", translator("uz"))).toBe(ru("1_234 eʼlonlar"));
    expect(formatCount(1, "listings", "en", translator("en"))).toBe("1 listing");
    expect(formatCount(1234, "listings", "en", translator("en"))).toBe("1,234 listings");
  });
});
