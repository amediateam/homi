import { describe, expect, it } from "vitest";

import { digestHours, formatDigestHours } from "@/features/settings/format";

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
