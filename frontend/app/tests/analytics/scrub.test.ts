import { describe, expect, it } from "vitest";

import { isAppAddress, scrubDeep, scrubText, stripUrl } from "@/lib/analytics/scrub";

describe("scrubText (WP-32, SEC-REQ-047, TMA-009)", () => {
  it("masks Telegram's launch data in a query, in a hash and in the middle of a sentence, up to the next & or #", () => {
    // An address loses its whole query and hash; outside an address the launch data is masked up to `&` or `#`.
    expect(scrubText("https://app.homi.uz/ru?tgWebAppData=query_id%3DAA&x=1")).toBe("https://app.homi.uz/ru");
    expect(scrubText("https://app.homi.uz/ru#tgWebAppData=user%3D%7B%7D#rest")).toBe("https://app.homi.uz/ru");
    expect(scrubText("hash tgWebAppData=user%3D%7B%7D#rest")).toBe("hash tgWebAppData=***#rest");
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

  it("masks the other ways a number is written (review of WP-32): 00998, the nine local digits, 8 before them, dashes of any kind, other countries", () => {
    expect(scrubText("00998 90 123 45 67")).toBe("+998***");
    expect(scrubText("звоните 90 123 45 67 вечером")).toBe("звоните +998*** вечером");
    expect(scrubText("8 (90) 123-45-67")).toBe("+998***");
    expect(scrubText("+998 90 123–45–67")).toBe("+998***");
    expect(scrubText("+7 912 345 67 89")).toBe("+***");
    // A price or a year is not a phone.
    expect(scrubText("$600 за 54 м², 2026 год")).toBe("$600 за 54 м², 2026 год");
  });

  it("leaves ids, prices, versions and coordinates alone; masks Tashkent landlines and the code 20 (second review)", () => {
    expect(scrubText("c362c406-9360-4676-8a0b-1f2e3d4c5b6a")).toBe("c362c406-9360-4676-8a0b-1f2e3d4c5b6a");
    expect(scrubText("950 000 000 сум, 1 950 000 000, +150 000 000")).toBe("950 000 000 сум, 1 950 000 000, +150 000 000");
    expect(scrubText("Chrome/99.0.4844.88 at 41.33 69.24012")).toBe("Chrome/99.0.4844.88 at 41.33 69.24012");
    expect(scrubText("тел. 71 123 45 67, 20 123 45 67, (90) 123-45-67")).toBe("тел. +998***, +998***, +998***");
  });

  it("takes the query and hash off an address inside a text, an absolute one or a path, without eating what follows", () => {
    expect(scrubText("bad https://app.homi.uz/ru/map?area=1,2#x here")).toBe("bad https://app.homi.uz/ru/map here");
    expect(scrubText('{"url":"https://app.homi.uz/ru?city=x","n":1}')).toBe('{"url":"https://app.homi.uz/ru","n":1}');
    expect(scrubText("GET /bff/listings?area=41.31,69.24 failed")).toBe("GET /bff/listings failed");
    expect(scrubText("HTTPS://APP.HOMI.UZ/ru?x=1 and wss://h/s?token=abc")).toBe("HTTPS://APP.HOMI.UZ/ru and wss://h/s");
  });

  it("an encoded query leaves no part of itself behind", () => {
    expect(scrubText("see https://app.homi.uz/ru/map?polygon=41.3%2069.2%2041.4%2069.3 now")).toBe("see https://app.homi.uz/ru/map now");
  });

  it("a number in a query is masked before the address loses its query", () => {
    expect(scrubText("x?tel=+998 901 234 567 end")).not.toMatch(/901 234 567/);
  });

  it("masks a +998 number next to letters, encoded or joined (third and fourth reviews)", () => {
    for (const text of [
      "Tel+998901234567",
      "+998901234567ga",
      "998901234567ta",
      "phone_998901234567",
      "%2B998901234567",
      "%2B998%2090%20123%2045%2067",
      "%20998901234567",
      "%2B998+90+123+45+67",
      "+998_90_123_45_67",
      "+998\u200b90\u200b1234567",
    ]) {
      expect(scrubText(text)).not.toMatch(/\d{9}/);
    }
  });

  it("masks decoded launch data field by field", () => {
    expect(scrubText('query_id=AAH1&user={"id":42,"first_name":"Ali"}&auth_date=1700000000&hash=abc123&signature=xyz')).toBe(
      "query_id=***&user=***&auth_date=***&hash=***&signature=***",
    );
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
