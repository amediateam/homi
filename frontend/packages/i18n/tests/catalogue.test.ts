import { describe, expect, it } from "vitest";

import { locales } from "@homi/config";

import brandWords from "../brand-words.json";
import legacyEn from "../messages/legacy/en.json";
import keyList from "../messages/legacy/keys.json";
import leafAndPrefix from "../messages/legacy/leaf-and-prefix.json";
import legacyRu from "../messages/legacy/ru.json";
import legacyUz from "../messages/legacy/uz.json";
import { getMessages } from "../src/index";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string" ? [[`${prefix}${key}`, value]] : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

/** The legacy name of a catalogue path: `sheet.market._` → `sheet.market`. */
const legacyName = (path: string) => path.replace(/\._$/, "");

const PLURALS = [
  "listings",
  "listing.rooms",
  "details.daysOnMarket",
  "details.publications",
  "details.channels",
  "details.views",
  "actions.blockCount",
  "map.missing",
  "market.info.agoMin",
  "market.info.agoHour",
  "market.info.agoDay",
  "market.v3.found",
  "market.v3.district",
  "market.v3.city",
  "back.new",
];

describe("the merged catalogues", () => {
  const merged = Object.fromEntries(locales.map((locale) => [locale, flatten(getMessages(locale) as Tree)]));

  it("have identical key sets in ru, uz and en", () => {
    const ru = Object.keys(merged.ru).sort();
    expect(Object.keys(merged.uz).sort()).toEqual(ru);
    expect(Object.keys(merged.en).sort()).toEqual(ru);
  });

  it("hold the 15 plural keys as ICU plurals on n with the forms of each locale", () => {
    for (const locale of locales) {
      const plurals = Object.entries(merged[locale])
        .filter(([, value]) => value.startsWith("{n, plural,"))
        .map(([key]) => key);
      expect(plurals.sort()).toEqual([...PLURALS].sort());
    }
    expect(merged.ru["listing.rooms"]).toMatch(/one \{.*\} few \{.*\} many \{.*\} other \{.*\}/);
    expect(merged.ru["map.missing"]).toMatch(/^\{n, plural, one \{.*\} other \{.*\}\}$/);
    expect(merged.uz["listing.rooms"]).toMatch(/^\{n, plural, one \{.*\} other \{.*\}\}$/);
    expect(merged.en["back.new"]).toMatch(/^\{n, plural, one \{.*\} other \{.*\}\}$/);
  });

  it("contain no legacy brand word in any locale", () => {
    const patterns = brandWords.patterns.map((pattern) => new RegExp(pattern, "iu"));
    const hits = locales.flatMap((locale) =>
      Object.entries(merged[locale])
        .filter(([, value]) => patterns.some((pattern) => pattern.test(value)))
        .map(([key]) => `${locale}:${key}`),
    );
    expect(hits).toEqual([]);
  });

  it("carry the three keys this package adds", () => {
    expect([merged.ru["demo.label"], merged.uz["demo.label"], merged.en["demo.label"]]).toEqual([
      "Демо-данные",
      "Demo maʼlumotlar",
      "Demo data",
    ]);
    expect(merged.en["demo.hint"]).toBe("This section still runs on test data");
    expect([merged.ru["fallback.other"], merged.uz["fallback.other"], merged.en["fallback.other"]]).toEqual([
      "Другое",
      "Boshqa",
      "Other",
    ]);
  });

  it("carry the four keys of WP-23 next to the legacy keys of their namespaces", () => {
    const values = (key: string) => locales.map((locale) => merged[locale][key]);
    expect(values("error.notFound")).toEqual(["Такой страницы нет", "Bunday sahifa yoʻq", "This page doesn’t exist"]);
    expect(values("error.toSearch")).toEqual(["К поиску", "Qidiruvga", "Back to search"]);
    expect(values("error.sessionExpired")[0]).toBe("Сессия устарела — закройте и откройте приложение снова");
    for (const locale of locales) {
      expect(merged[locale]["city.countsDaily"].match(/\{\w+\}/g)).toEqual(["{rent}", "{daily}", "{sale}"]);
    }
    expect(merged.ru["error.retry"]).toBe("Повторить");
    expect(merged.ru["city.counts"]).toBe("{rent} аренда · {sale} продажа");
  });
});

describe("the legacy layer", () => {
  const layers = { ru: legacyRu, uz: legacyUz, en: legacyEn } as Record<string, Tree>;

  it("matches the key list of the pinned release, which keeps the legacy names", () => {
    expect(keyList.release).toBe("index-DY_DH7h-.js");
    expect(keyList.keys).toHaveLength(476);
    for (const layer of Object.values(layers)) {
      expect(Object.keys(flatten(layer)).map(legacyName).sort()).toEqual([...keyList.keys].sort());
    }
  });

  it("moves exactly the listed leaf-and-prefix keys to <key>._ and renames nothing else", () => {
    expect(leafAndPrefix).toEqual(["settings.graphics", "settings.theme", "sheet.market", "sheet.posted"]);
    const moved = Object.keys(flatten(layers.ru))
      .filter((path) => path.endsWith("._"))
      .map(legacyName)
      .sort();
    expect(moved).toEqual([...leafAndPrefix].sort());
  });

  it("drops the six dead keys", () => {
    expect([...keyList.dropped].sort()).toEqual(
      ["feed.historyHint", "subs.count", "subs.delete", "subs.edit", "subs.inFeed", "subs.modeAria"].sort(),
    );
    for (const dead of keyList.dropped) {
      expect(flatten(layers.ru)[dead]).toBeUndefined();
    }
  });
});
