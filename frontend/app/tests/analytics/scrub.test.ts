import { describe, expect, it } from "vitest";

import { isAppAddress, scrubDeep, scrubText, stripUrl } from "@/lib/analytics/scrub";

describe("scrubText (WP-32, SEC-REQ-047, TMA-009)", () => {
  it("masks Telegram's launch data in a query, in a hash and in the middle of a sentence, up to the next & or #", () => {
    expect(scrubText("https://app.homi.uz/ru?tgWebAppData=query_id%3DAA&x=1")).toBe("https://app.homi.uz/ru?tgWebAppData=***&x=1");
    expect(scrubText("https://app.homi.uz/ru#tgWebAppData=user%3D%7B%7D#rest")).toBe("https://app.homi.uz/ru#tgWebAppData=***#rest");
    expect(scrubText("failed at tgWebAppData=abc while loading")).toBe("failed at tgWebAppData=*** while loading");
  });

  it("masks a bearer token and the session cookie pair", () => {
    expect(scrubText("Authorization: Bearer 12|abcDEF.ghi-jkl_mno")).toBe("Authorization: Bearer ***");
    expect(scrubText("cookie homi_session=eyJpdiI6; other=1")).toBe("cookie homi_session=***; other=1");
  });

  it("masks +998 numbers with and without separators, and only those", () => {
    expect(scrubText("call +998 00 000 00 67 now")).toBe("call +998*** now");
    expect(scrubText("998000000067")).toBe("+998***");
    expect(scrubText("+998-90-123-45-67, +998 (90) 123 45 67")).toBe("+998***, +998***");
    // Not a phone: too few digits, or part of a longer number.
    expect(scrubText("998 12 34")).toBe("998 12 34");
    expect(scrubText("1998000000067")).toBe("1998000000067");
  });

  it("masks e-mail addresses", () => {
    expect(scrubText("from owner.name+tag@example.co.uz today")).toBe("from ***@*** today");
  });
});

describe("scrubDeep", () => {
  it("scrubs every string of a nested object to depth 6 and cuts deeper levels", () => {
    const value = { a: "+998901234567", b: [1, true, null, { c: "x@y.uz" }], d: { e: { f: { g: { h: { i: { j: "deep" } } } } } } };

    expect(scrubDeep(value)).toEqual({
      a: "+998***",
      b: [1, true, null, { c: "***@***" }],
      // Six levels of objects are kept (the root, d, e, f, g, h); the seventh is cut.
      d: { e: { f: { g: { h: { i: null } } } } },
    });
  });

  it("drops functions, symbols and undefined from objects", () => {
    expect(scrubDeep({ f: () => 1, s: Symbol("x"), u: undefined, n: 0 })).toEqual({ n: 0 });
  });
});

describe("stripUrl and isAppAddress", () => {
  it("keeps origin and path of the app's addresses and of foreign ones; a path loses its query and hash", () => {
    expect(stripUrl("https://app.homi.uz/ru/map?polygon=41.3,69.2&city=tashkent#tgWebAppData=x")).toBe("https://app.homi.uz/ru/map");
    expect(stripUrl("https://web.telegram.org/k/?a=1#@homi_bot")).toBe("https://web.telegram.org/k/");
    expect(stripUrl("/ru/listing/100001?from=radar#x")).toBe("/ru/listing/100001");
    expect(stripUrl("not an address +998901234567")).toBe("not an address +998***");
  });

  it("tells the app's own addresses from foreign ones", () => {
    expect(isAppAddress("https://app.homi.uz/ru?x=1", "https://app.homi.uz")).toBe(true);
    expect(isAppAddress("https://t.me/homi", "https://app.homi.uz")).toBe(false);
    expect(isAppAddress("/ru", "https://app.homi.uz")).toBe(false);
  });
});
