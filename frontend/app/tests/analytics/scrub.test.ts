import { describe, expect, it } from "vitest";

import { canonical, isAppAddress, REDACTED, scrubDeep, scrubText, stripUrl } from "@/lib/analytics/scrub";

describe("scrubText (WP-32, SEC-REQ-047, TMA-009)", () => {
  it("an address in a text loses its query and hash, launch data in them included; the text stays", () => {
    expect(scrubText("https://app.homi.uz/ru?tgWebAppData=query_id%3DAA&x=1")).toBe("https://app.homi.uz/ru");
    expect(scrubText("at https://app.homi.uz/ru#tgWebAppData=user%3D%7B%7D now")).toBe("at https://app.homi.uz/ru now");
  });

  it("a text that holds launch data, a bearer token or the session cookie outside an address is replaced whole", () => {
    expect(scrubText("hash tgWebAppData=user%3D%7B%7D#rest")).toBe(REDACTED);
    expect(scrubText("failed at tgWebAppData=abc while loading")).toBe(REDACTED);
    expect(scrubText("Authorization: Bearer 12|abcDEF.ghi-jkl_mno")).toBe(REDACTED);
    expect(scrubText("cookie homi_session=eyJpdiI6; other=1")).toBe(REDACTED);
    // Idempotent: the journal scrubs, the /bff proxy scrubs again.
    expect(scrubText(REDACTED)).toBe(REDACTED);
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

  it("judges a text on its canonical form: escapes decoded up to three times, a broken sequence never throws", () => {
    expect(canonical("a%2520b%253Dc")).toBe("a b=c");
    expect(canonical("%E0%A4%A broken %ZZ %41")).toBe("%E0%A4%A broken %ZZ A");
    // Three passes and no more: `%25` three times unwrapped leaves one `%25`.
    expect(canonical("%25252525")).toBe("%25");
  });

  it("leaves ordinary texts as they are", () => {
    for (const text of [
      "Loading chunk 123 failed",
      "Cannot read properties of undefined (reading 'user')",
      "the user tapped the hash sign",
      "price 950 000 000 sum, area 41.5 m2",
      "listing 100018 at 41.311081, 69.240562",
      "1+1=2 and snake_case_ids_123456789",
      "0f8e2a4c-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
      "+998 ** *** ** 67",
    ]) {
      expect(scrubText(text)).toBe(text);
    }
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

/** `text` with every escape it may still hold decoded, as a reader would. */
function reveal(text: string): string {
  return canonical(canonical(text));
}

const enc = encodeURIComponent;
const USER = JSON.stringify({ id: 4242, first_name: "Ivan Петров", username: "alivali77", language_code: "ru" });
const INIT_DATA = `query_id=AAHxyz1&user=${enc(USER)}&auth_date=1700000000&hash=c0ffee1234abcd5678&signature=SiGn4tur3`;
const TOKEN = "7|AbCdEf123456GhIjKl7890";
const COOKIE = "s3ss10nV4lueXyz";

/** A secret, its forms (raw, decoded, encoded once and twice, `=` encoded) and the pieces that must never be seen. */
const SECRETS: { name: string; forms: string[]; pieces: string[] }[] = [
  {
    name: "launch data",
    forms: [
      INIT_DATA,
      decodeURIComponent(INIT_DATA),
      enc(INIT_DATA),
      enc(enc(INIT_DATA)),
      INIT_DATA.replace(/=/g, "%3D"),
      INIT_DATA.replace(/=/g, "%253D"),
      `tgWebAppData=${enc(INIT_DATA)}`,
      USER,
      JSON.stringify(JSON.parse(USER)).replace(/"/g, "'"),
    ],
    pieces: ["Ivan", "Петров", "alivali77", "c0ffee1234abcd5678", "AAHxyz1", "SiGn4tur3"],
  },
  {
    name: "a bearer token",
    forms: [`Bearer ${TOKEN}`, `Bearer+${TOKEN}`, `Bearer%20${enc(TOKEN)}`, `Bearer%2520${enc(enc(TOKEN))}`, `Bearer ${enc(TOKEN)}`, `bearer:${TOKEN}`],
    pieces: ["AbCdEf123456", "GhIjKl7890"],
  },
  {
    name: "the session cookie",
    forms: [`homi_session=${COOKIE}`, `homi_session%3D${COOKIE}`, `homi_session%253D${COOKIE}`, `Cookie: a=1; homi_session=${COOKIE}`, `HOMI_SESSION = ${COOKIE}`],
    pieces: [COOKIE],
  },
  {
    name: "an e-mail address",
    forms: ["owner.name@example.uz", "owner.name%40example.uz", "owner.name%2540example.uz"],
    pieces: ["owner.name"],
  },
  {
    name: "a phone number",
    forms: [
      "+998 90 123 45 67",
      "+998-90-123-45-67",
      "(90) 123-45-67",
      "998901234567",
      "Tel+998901234567",
      enc("+998 90 123 45 67"),
      enc(enc("+998 90 123 45 67")),
      "%2B998+90+123+45+67",
    ],
    pieces: ["1234567"],
  },
];

/** Where a secret may sit in a text: alone, after an escape, in a sentence, in JSON, in an address's query or hash. */
const WRAPPERS: { name: string; wrap: (secret: string) => string }[] = [
  { name: "alone", wrap: (secret) => secret },
  { name: "after %20", wrap: (secret) => `x%20${secret}` },
  { name: "after %0A", wrap: (secret) => `x%0A${secret}` },
  { name: "after %26", wrap: (secret) => `x%26${secret}` },
  { name: "in a sentence", wrap: (secret) => `failed: ${secret} while loading` },
  { name: "on a new line", wrap: (secret) => `Error\n${secret}` },
  { name: "in JSON", wrap: (secret) => JSON.stringify({ message: secret }) },
  { name: "quoted", wrap: (secret) => `"${secret}"` },
  { name: "in a query", wrap: (secret) => `https://app.homi.uz/ru?x=${secret} after` },
  { name: "in a hash", wrap: (secret) => `https://app.homi.uz/ru#tgWebAppData=${secret} after` },
  { name: "in a path's query", wrap: (secret) => `GET /bff/x?q=${secret} failed` },
];

/** The digits of `text` only, so a number written with separators is found whole. */
const digits = (text: string) => text.replace(/\D/g, "");

describe("scrubText: no secret survives any form or place (sixth review; the canonical form)", () => {
  for (const secret of SECRETS) {
    for (const wrapper of WRAPPERS) {
      it(`${secret.name}, ${wrapper.name}`, () => {
        for (const form of secret.forms) {
          const out = reveal(scrubText(wrapper.wrap(form)));
          for (const piece of secret.pieces) {
            if (secret.name === "a phone number") {
              expect(digits(out), form).not.toContain(piece);
            } else {
              expect(out, form).not.toContain(piece);
            }
          }
        }
      });
    }
  }
});

