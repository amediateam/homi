import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildLayer, DEAD_KEYS, escapeIcu, importLegacy, parseLocaleModule } from "../scripts/import-legacy.mjs";

/** The importer of the legacy catalogues (WP-20), on small hand-made inputs. */
describe("parseLocaleModule", () => {
  it("reads quoted and bare keys, both quote styles, escapes and plural objects without running the file", () => {
    const flat = parseLocaleModule(`// header comment
export const ru = {
  'tab.search': 'Поиск',
  "actions.hideHint": "We won't show it",
  listings: {
    one: 'объявление',
    other: 'объявления', /* trailing */
  },
  'a.long':
    'first \\'quoted\\' line\\n',
};
`);

    expect(flat).toEqual({
      "tab.search": "Поиск",
      "actions.hideHint": "We won't show it",
      listings: { one: "объявление", other: "объявления" },
      "a.long": "first 'quoted' line\n",
    });
  });

  it("refuses anything that is not a plain object literal of strings", () => {
    expect(() => parseLocaleModule("export const ru = { a: fn() };")).toThrow();
    expect(() => parseLocaleModule("export const ru = { a: `x ${y}` };")).toThrow();
  });
});

describe("escapeIcu", () => {
  it("keeps placeholders and plain apostrophes", () => {
    expect(escapeIcu("{n} m² · it's {city}", false)).toBe("{n} m² · it's {city}");
  });

  it("doubles an apostrophe that ICU would read as a quote", () => {
    expect(escapeIcu("'{name}'", false)).toBe("''{name}''");
    expect(escapeIcu("a''b", false)).toBe("a'''b");
  });

  it("quotes stray braces, angle brackets and a hash inside a plural", () => {
    expect(escapeIcu("a {b c} d", false)).toBe("a '{'b c'}' d");
    expect(escapeIcu("{not a placeholder", false)).toBe("'{'not a placeholder");
    expect(escapeIcu("<b>bold", false)).toBe("'<'b>bold");
    expect(escapeIcu("#1 of {n}", true)).toBe("'#'1 of {n}");
    expect(escapeIcu("#1", false)).toBe("#1");
    expect(escapeIcu("x '{{ y", false)).toBe("x '''{{' y");
  });
});

describe("buildLayer", () => {
  it("nests dotted keys, moves a leaf that is also a prefix to <key>._ and drops the dead keys", () => {
    const layer = buildLayer(
      {
        "sheet.title": "Фильтры",
        "sheet.market": "Дом",
        "sheet.market.new": "Новостройка",
        "feed.historyHint": "dead",
        "subs.count": "dead",
      },
      "ru",
    );

    expect(layer.messages).toEqual({ sheet: { title: "Фильтры", market: { _: "Дом", new: "Новостройка" } } });
    expect(layer.leafAndPrefix).toEqual(["sheet.market"]);
    expect(layer.dropped).toEqual(["feed.historyHint", "subs.count"]);
    expect(layer.keys).toEqual(["sheet.title", "sheet.market", "sheet.market.new"]);
  });

  it("turns a plural object into an ICU plural on n with the forms the locale file has", () => {
    const ru = buildLayer({ "listing.rooms": { one: "комната", few: "комнаты", many: "комнат", other: "комнаты" } }, "ru");
    const en = buildLayer({ "map.missing": { one: "for {n} listing", other: "for {n} listings" } }, "en");

    expect(ru.messages).toEqual({ listing: { rooms: "{n, plural, one {комната} few {комнаты} many {комнат} other {комнаты}}" } });
    expect(ru.plurals).toEqual(["listing.rooms"]);
    expect(en.messages).toEqual({ map: { missing: "{n, plural, one {for {n} listing} other {for {n} listings}}" } });
  });

  it("refuses a plural without other and a form that is not a plural category", () => {
    expect(() => buildLayer({ x: { one: "a" } }, "ru")).toThrow(/other/);
    expect(() => buildLayer({ x: { one: "a", lots: "b", other: "c" } }, "ru")).toThrow(/lots/);
  });

  it("lists every value it changed", () => {
    const layer = buildLayer({ "a.b": "{x} and {y", "a.c": "plain" }, "en");

    expect(layer.changed).toEqual([{ key: "a.b", before: "{x} and {y", after: "{x} and '{'y" }]);
  });

  it("knows the six dead keys of the audit", () => {
    expect([...DEAD_KEYS].sort()).toEqual(
      ["feed.historyHint", "subs.count", "subs.delete", "subs.edit", "subs.inFeed", "subs.modeAria"].sort(),
    );
  });
});

describe("importLegacy", () => {
  it("reads ru, uz_Latn and en from a copy, writes ru, uz and en, the key list and the leaf-and-prefix list", () => {
    const from = mkdtempSync(join(tmpdir(), "homi-i18n-from-"));
    const to = mkdtempSync(join(tmpdir(), "homi-i18n-to-"));
    const files: Record<string, string> = {
      "ru.js": "export const ru = { 'a.b': 'А', 'a.b.c': 'Б', 'subs.edit': 'x' };",
      "uz_Latn.js": "export const uz_Latn = { 'a.b': 'A', 'a.b.c': 'B', 'subs.edit': 'x' };",
      "en.js": "export const en = { 'a.b': 'A', 'a.b.c': 'B', 'subs.edit': 'x' };",
    };
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(from, name), source);
    }

    const report = importLegacy({ from, to, release: "index-test.js" });

    expect(JSON.parse(readFileSync(join(to, "uz.json"), "utf8"))).toEqual({ a: { b: { _: "A", c: "B" } } });
    expect(JSON.parse(readFileSync(join(to, "keys.json"), "utf8"))).toEqual({
      release: "index-test.js",
      keys: ["a.b", "a.b.c"],
      dropped: ["subs.edit"],
    });
    expect(JSON.parse(readFileSync(join(to, "leaf-and-prefix.json"), "utf8"))).toEqual(["a.b"]);
    expect(report.locales.map((entry: { locale: string }) => entry.locale)).toEqual(["ru", "uz", "en"]);
  });

  it("refuses locale files whose key sets differ", () => {
    const from = mkdtempSync(join(tmpdir(), "homi-i18n-from-"));
    writeFileSync(join(from, "ru.js"), "export const ru = { a: 'А', b: 'Б' };");
    writeFileSync(join(from, "uz_Latn.js"), "export const uz_Latn = { a: 'A' };");
    writeFileSync(join(from, "en.js"), "export const en = { a: 'A', b: 'B' };");

    expect(() => importLegacy({ from, to: mkdtempSync(join(tmpdir(), "homi-i18n-to-")), release: "x" })).toThrow(/uz/);
  });
});
