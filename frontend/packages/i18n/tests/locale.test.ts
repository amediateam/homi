import { describe, expect, it } from "vitest";

import { htmlLang, numberLocale } from "../src/index";

describe("locale helpers", () => {
  it("gives the html lang legacy sets (the language part of its Intl locale)", () => {
    expect([htmlLang("ru"), htmlLang("uz"), htmlLang("en")]).toEqual(["ru", "uz", "en"]);
  });

  it("formats numbers with ru-RU for ru and uz and en-GB for en", () => {
    expect([numberLocale("ru"), numberLocale("uz"), numberLocale("en")]).toEqual(["ru-RU", "ru-RU", "en-GB"]);
    expect(new Intl.NumberFormat(numberLocale("uz")).format(1234567.5).replace(/\s/gu, " ")).toBe("1 234 567,5");
  });
});
