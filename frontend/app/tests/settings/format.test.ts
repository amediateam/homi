import { describe, expect, it } from "vitest";

import { cardStyleOf, digestHours, digestLabel, formatDigestHours, graphicsLabel, hoursOf, optionName, quietLabel, sameHours, sameQuiet, themeLabel } from "@/features/settings/format";

import { translator } from "../helpers/listing";

const tRu = translator("ru");
const tUz = translator("uz");
const tEn = translator("en");

describe("formatDigestHours (WP-30, the digest hint of SCR-028)", () => {
  it("one hour alone, two and three joined with the word of each locale", () => {
    expect(formatDigestHours([9], tRu)).toBe("9");
    expect(formatDigestHours([9, 19], tRu)).toBe("9 и 19");
    expect(formatDigestHours([9, 12, 19], tRu)).toBe("9 и 12 и 19");
    expect(formatDigestHours([9, 19], tEn)).toBe("9 and 19");
    expect(formatDigestHours([0, 12, 20], tEn)).toBe("0 and 12 and 20");
  });

  it("uz: the trailing space notify.and lacks is added (legacy read «9 va19»)", () => {
    expect(tUz("notify.and")).toBe(" va");
    expect(formatDigestHours([9, 19], tUz)).toBe("9 va 19");
    expect(formatDigestHours([9, 12, 19], tUz)).toBe("9 va 12 va 19");
  });

  it("fills the hint of every locale", () => {
    expect(tRu("radar.digestHint", { time: formatDigestHours([9, 19], tRu) })).toBe("Списком в 9 и 19");
    expect(tUz("radar.digestHint", { time: formatDigestHours([9, 19], tUz) })).toBe("Roʻyxat — 9 va 19 da");
  });

  it("no hours is an empty string", () => {
    expect(formatDigestHours([], tRu)).toBe("");
  });
});

describe("digestHours (WP-30)", () => {
  it("the hours of the settings, in the server's order", () => {
    expect(digestHours({ digest_hours: [9, 19] })).toEqual([9, 19]);
    expect(digestHours({ digest_hours: [19, 9] })).toEqual([19, 9]);
    expect(digestHours({ digest_hours: [0, 23] })).toEqual([0, 23]);
  });

  it("null without settings or without a usable hour, so the sheet shows the hint without a time", () => {
    for (const settings of [undefined, null, "9,19", {}, { digest_hours: null }, { digest_hours: "9,19" }, { digest_hours: [] }, { digest_hours: [24, -1, 9.5, "9"] }]) {
      expect(digestHours(settings), JSON.stringify(settings)).toBeNull();
    }
  });

  it("drops invalid entries and keeps the rest", () => {
    expect(digestHours({ digest_hours: ["9", 9, 25, 19, Number.NaN] })).toEqual([9, 19]);
  });
});

describe("the settings values (WP-31, SCR-032)", () => {
  const t = translator("ru");

  it("quiet hours: two digits each with an en dash, «Выкл» for off, nothing for a malformed value", () => {
    expect(quietLabel({ from: 23, to: 8 }, t)).toBe("23–08");
    expect(quietLabel({ from: 0, to: 9 }, t)).toBe("00–09");
    expect(quietLabel(null, t)).toBe("Выкл");
    expect(quietLabel({ from: 24, to: 8 }, t)).toBe("");
    expect(quietLabel("23-08", t)).toBe("");
    expect(quietLabel(undefined, t)).toBe("");
  });

  it("digest hours: «9», «9 и 21», a value in no preset, and nothing for a non-list or an empty list", () => {
    expect(digestLabel([9], t)).toBe("9");
    expect(digestLabel([9, 21], t)).toBe("9 и 21");
    expect(digestLabel([12, 20], t)).toBe("12 и 20");
    expect(digestLabel("9,21", t)).toBe("");
    expect(digestLabel([], t)).toBe("");
    expect(hoursOf([9, "x", 25, 21])).toEqual([9, 21]);
  });

  it("graphics: «Полная», «Облегчённая», and auto with what it chooses now", () => {
    expect(graphicsLabel("full", true, t)).toBe("Полная");
    expect(graphicsLabel("lite", false, t)).toBe("Облегчённая");
    expect(graphicsLabel("auto", false, t)).toBe("Авто · полная");
    expect(graphicsLabel("auto", true, t)).toBe("Авто · облегчённая");
  });

  it("theme labels and the name of a code in an option list, else the code (an unknown language)", () => {
    expect(themeLabel("auto", t)).toBe("Как в Telegram");
    expect(themeLabel("dark", t)).toBe("Тёмная");
    const locales = [
      { code: "ru", name: "Русский" },
      { code: "en", name: "English" },
    ];
    expect(optionName(locales, "en")).toBe("English");
    expect(optionName(locales, "uz")).toBe("uz");
    expect(optionName(undefined, "ru")).toBe("ru");
    expect(optionName([{ code: "ru", name: "" }], "ru")).toBe("ru");
  });

  it("the card style: «Новый» only for rich; anything else is classic (LB-APP-051)", () => {
    expect(cardStyleOf({ card_style: "rich" })).toBe("rich");
    expect(cardStyleOf({ card_style: "classic" })).toBe("classic");
    expect(cardStyleOf({ card_style: "fancy" })).toBe("classic");
    expect(cardStyleOf({})).toBe("classic");
    expect(cardStyleOf(undefined)).toBe("classic");
  });

  it("the same setting: both off or the same hours; the same digest list in order", () => {
    expect(sameQuiet(null, null)).toBe(true);
    expect(sameQuiet({ from: 23, to: 8 }, { from: 23, to: 8 })).toBe(true);
    expect(sameQuiet({ from: 23, to: 8 }, null)).toBe(false);
    expect(sameQuiet({ from: 23, to: 8 }, { from: 22, to: 8 })).toBe(false);
    expect(sameHours([9, 19], [9, 19])).toBe(true);
    expect(sameHours([9, 19], [19, 9])).toBe(false);
    expect(sameHours([9], "9")).toBe(false);
  });
});
