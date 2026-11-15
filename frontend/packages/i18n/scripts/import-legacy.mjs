#!/usr/bin/env node
/**
 * Importer of the legacy Mini App catalogues into the `legacy` layer of @homi/i18n (WP-20).
 *
 * Input: a directory holding a *copy* of the three locale files of the pinned legacy release (`ru.js`,
 * `uz_Latn.js`, `en.js`). Nothing is run inside the legacy tree and the copied files are not executed either: each
 * file is read as text and its object literal is parsed by the small reader below, which accepts only string values
 * and plural objects of strings.
 *
 * Output (`messages/legacy/`): `ru.json`, `uz.json`, `en.json`, `keys.json` (the legacy key names of the release, for
 * the next release diff) and `leaf-and-prefix.json`. Rules (WP-20 "Importer"):
 *
 * 1. `uz_Latn` becomes `uz`; a dotted key becomes a nested path.
 * 2. A key that is both a message and the prefix of other keys moves to `<key>._`.
 * 3. A plural object becomes an ICU plural on the argument `n`, with the forms the locale file has.
 * 4. Characters ICU treats specially are escaped; every changed value is reported.
 * 5. The six dead keys of the audit are dropped.
 * 6. Values are otherwise byte-identical.
 *
 * Usage: `node scripts/import-legacy.mjs --from <dir> --release <bundle name> [--to <dir>] [--report <file.md>]`.
 * Node built-ins only.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Legacy file name → HOMI locale (CF-006). */
export const LOCALE_FILES = /** @type {const} */ ([
  ["ru.js", "ru"],
  ["uz_Latn.js", "uz"],
  ["en.js", "en"],
]);

/** Defined in legacy but never referenced (`03` §3.1, LB-APP-026). */
export const DEAD_KEYS = new Set([
  "feed.historyHint",
  "subs.count",
  "subs.inFeed",
  "subs.edit",
  "subs.delete",
  "subs.modeAria",
]);

const PLURAL_FORMS = ["zero", "one", "two", "few", "many", "other"];

/**
 * @typedef {string | Record<string, string>} LegacyValue
 * @typedef {Record<string, LegacyValue>} LegacyCatalogue
 * @typedef {{ [key: string]: string | NestedMessages }} NestedMessages
 * @typedef {{ key: string, before: string, after: string }} ChangedValue
 * @typedef {{
 *   messages: NestedMessages,
 *   keys: string[],
 *   dropped: string[],
 *   leafAndPrefix: string[],
 *   plurals: string[],
 *   changed: ChangedValue[],
 * }} Layer
 */

/**
 * Parses `export const <name> = { … };` — keys are quoted strings or identifiers, values are strings or one level of
 * `{ <form>: string }`. Comments are skipped. Anything else (calls, spreads, template substitutions) throws.
 *
 * @param {string} source
 * @returns {LegacyCatalogue}
 */
export function parseLocaleModule(source) {
  let i = 0;

  const fail = (/** @type {string} */ message) => {
    const line = source.slice(0, i).split("\n").length;
    throw new Error(`${message} at line ${line}`);
  };

  const skip = () => {
    for (;;) {
      while (i < source.length && /\s/.test(source[i])) i++;
      if (source.startsWith("//", i)) {
        const end = source.indexOf("\n", i);
        i = end === -1 ? source.length : end + 1;
      } else if (source.startsWith("/*", i)) {
        const end = source.indexOf("*/", i + 2);
        if (end === -1) fail("Unclosed comment");
        i = end + 2;
      } else {
        return;
      }
    }
  };

  const expect = (/** @type {string} */ char) => {
    skip();
    if (source[i] !== char) fail(`Expected "${char}", found "${source[i] ?? "end of file"}"`);
    i++;
  };

  const readString = () => {
    const quote = source[i];
    let out = "";
    i++;
    while (i < source.length && source[i] !== quote) {
      const char = source[i];
      if (quote === "`" && char === "$" && source[i + 1] === "{") fail("Template substitution");
      if (char === "\n" && quote !== "`") fail("Line break inside a string");
      if (char !== "\\") {
        out += char;
        i++;
        continue;
      }
      const next = source[i + 1];
      const simple = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"', "`": "`" };
      if (next in simple) {
        out += simple[/** @type {keyof typeof simple} */ (next)];
        i += 2;
      } else if (next === "u" && source[i + 2] === "{") {
        const end = source.indexOf("}", i);
        out += String.fromCodePoint(parseInt(source.slice(i + 3, end), 16));
        i = end + 1;
      } else if (next === "u") {
        out += String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16));
        i += 6;
      } else if (next === "\n") {
        i += 2;
      } else {
        fail(`Unknown escape \\${next}`);
      }
    }
    if (source[i] !== quote) fail("Unclosed string");
    i++;
    return out;
  };

  const readKey = () => {
    skip();
    const char = source[i];
    if (char === "'" || char === '"') return readString();
    const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
    if (!match) fail(`Expected a key, found "${char}"`);
    i += /** @type {RegExpExecArray} */ (match)[0].length;
    return /** @type {RegExpExecArray} */ (match)[0];
  };

  /** @param {boolean} nested */
  const readObject = (nested) => {
    expect("{");
    /** @type {Record<string, LegacyValue>} */
    const out = {};
    for (;;) {
      skip();
      if (source[i] === "}") {
        i++;
        return out;
      }
      const key = readKey();
      if (Object.hasOwn(out, key)) fail(`Duplicate key "${key}"`);
      expect(":");
      skip();
      const char = source[i];
      if (char === "'" || char === '"' || char === "`") {
        out[key] = readString();
      } else if (char === "{" && !nested) {
        out[key] = /** @type {Record<string, string>} */ (readObject(true));
      } else {
        fail(`Unsupported value for "${key}"`);
      }
      skip();
      if (source[i] === ",") {
        i++;
      } else if (source[i] !== "}") {
        fail(`Expected "," or "}" after "${key}"`);
      }
    }
  };

  const start = /export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*/.exec(source);
  if (!start) throw new Error("No `export const <name> = {` found");
  i = start.index + start[0].length;
  const catalogue = /** @type {LegacyCatalogue} */ (readObject(false));
  skip();
  if (source[i] === ";") i++;
  skip();
  if (i < source.length) fail("Unexpected content after the catalogue");
  return catalogue;
}

const PLACEHOLDER = /^\{[A-Za-z_][A-Za-z0-9_]*\}/;

/**
 * Escapes the characters ICU message syntax treats specially so that the formatted text equals `text`:
 * stray braces, `<`, and `#` inside a plural are quoted; an apostrophe is doubled where ICU would read it as the
 * start of a quote. `{name}` placeholders stay.
 *
 * @param {string} text
 * @param {boolean} inPlural
 */
export function escapeIcu(text, inPlural) {
  const isSpecial = (/** @type {string | undefined} */ char) =>
    char === "{" || char === "}" || char === "<" || (inPlural && char === "#");
  let out = "";
  let i = 0;
  while (i < text.length) {
    const placeholder = PLACEHOLDER.exec(text.slice(i));
    if (placeholder) {
      out += placeholder[0];
      i += placeholder[0].length;
      continue;
    }
    const char = text[i];
    if (char === "'") {
      const next = text[i + 1];
      const quoteStart = next === undefined || next === "'" || next === "{" || next === "}";
      out += quoteStart || next === "<" || next === ">" || next === "#" ? "''" : "'";
      i++;
      continue;
    }
    if (isSpecial(char)) {
      let run = "";
      while (i < text.length && !PLACEHOLDER.test(text.slice(i)) && (isSpecial(text[i]) || (run && text[i] === "'"))) {
        run += text[i] === "'" ? "''" : text[i];
        i++;
      }
      out += `'${run}'`;
      continue;
    }
    out += char;
    i++;
  }
  return out;
}

/**
 * Builds the nested `legacy` layer of one locale from its flat legacy catalogue.
 *
 * @param {LegacyCatalogue} flat
 * @param {string} locale HOMI locale (`ru`, `uz`, `en`), for the plural categories
 * @returns {Layer}
 */
export function buildLayer(flat, locale) {
  const categories = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  const keys = Object.keys(flat).filter((key) => !DEAD_KEYS.has(key));
  const dropped = Object.keys(flat).filter((key) => DEAD_KEYS.has(key));
  const prefixes = new Set(keys.flatMap((key) => key.split(".").slice(1).map((_, n) => key.split(".").slice(0, n + 1).join("."))));
  const leafAndPrefix = keys.filter((key) => prefixes.has(key)).sort();
  /** @type {NestedMessages} */
  const messages = {};
  /** @type {string[]} */
  const plurals = [];
  /** @type {ChangedValue[]} */
  const changed = [];

  for (const key of keys) {
    const value = flat[key];
    let message;
    if (typeof value === "string") {
      message = escapeIcu(value, false);
      if (message !== value) changed.push({ key, before: value, after: message });
    } else {
      const forms = Object.keys(value);
      if (!forms.includes("other")) throw new Error(`Plural "${key}" (${locale}) has no "other" form`);
      for (const form of forms) {
        if (!PLURAL_FORMS.includes(form)) throw new Error(`Plural "${key}" (${locale}) has the unknown form "${form}"`);
        if (!categories.has(/** @type {Intl.LDMLPluralRule} */ (form))) {
          throw new Error(`Plural "${key}" (${locale}) has the form "${form}", which ${locale} does not use`);
        }
      }
      const branches = PLURAL_FORMS.filter((form) => forms.includes(form)).map((form) => {
        const text = value[form];
        const escaped = escapeIcu(text, true);
        if (escaped !== text) changed.push({ key: `${key}.${form}`, before: text, after: escaped });
        return `${form} {${escaped}}`;
      });
      message = `{n, plural, ${branches.join(" ")}}`;
      plurals.push(key);
    }

    const path = leafAndPrefix.includes(key) ? [...key.split("."), "_"] : key.split(".");
    /** @type {NestedMessages} */
    let node = messages;
    for (const segment of path.slice(0, -1)) {
      const existing = node[segment];
      if (typeof existing === "string") throw new Error(`"${key}" collides with the message "${segment}"`);
      node = existing ?? (node[segment] = {});
    }
    const leaf = /** @type {string} */ (path.at(-1));
    if (Object.hasOwn(node, leaf)) throw new Error(`"${key}" collides with an existing path`);
    node[leaf] = message;
  }

  return { messages, keys, dropped, leafAndPrefix, plurals, changed };
}

/**
 * Reads the three copied locale files from `from` and writes the `legacy` layer into `to`.
 *
 * @param {{ from: string, to: string, release: string }} options
 */
export function importLegacy({ from, to, release }) {
  const locales = LOCALE_FILES.map(([file, locale]) => ({
    locale,
    file,
    layer: buildLayer(parseLocaleModule(readFileSync(join(from, file), "utf8")), locale),
  }));

  const reference = locales[0].layer;
  for (const { locale, layer } of locales.slice(1)) {
    const missing = reference.keys.filter((key) => !layer.keys.includes(key));
    const extra = layer.keys.filter((key) => !reference.keys.includes(key));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(`${locale}: key set differs from ru (missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"})`);
    }
    if (layer.leafAndPrefix.join() !== reference.leafAndPrefix.join()) {
      throw new Error(`${locale}: leaf-and-prefix keys differ from ru`);
    }
  }

  mkdirSync(to, { recursive: true });
  const write = (/** @type {string} */ name, /** @type {unknown} */ value) =>
    writeFileSync(join(to, name), `${JSON.stringify(value, null, 2)}\n`);
  for (const { locale, layer } of locales) {
    write(`${locale}.json`, layer.messages);
  }
  write("keys.json", { release, keys: reference.keys, dropped: reference.dropped });
  write("leaf-and-prefix.json", reference.leafAndPrefix);

  return {
    release,
    locales: locales.map(({ locale, file, layer }) => ({
      locale,
      file,
      keys: layer.keys.length,
      plurals: layer.plurals,
      dropped: layer.dropped,
      leafAndPrefix: layer.leafAndPrefix,
      changed: layer.changed,
    })),
  };
}

/** @param {ReturnType<typeof importLegacy>} report */
export function formatReport(report) {
  const lines = [`# Legacy catalogue import — ${report.release}`, ""];
  for (const entry of report.locales) {
    lines.push(`## ${entry.locale} (from ${entry.file})`, "");
    lines.push(`- keys: ${entry.keys}`);
    lines.push(`- plural messages (${entry.plurals.length}): ${entry.plurals.join(", ")}`);
    lines.push(`- dropped (${entry.dropped.length}): ${entry.dropped.join(", ")}`);
    lines.push(`- moved to <key>._ (${entry.leafAndPrefix.length}): ${entry.leafAndPrefix.join(", ")}`);
    lines.push(`- values changed by escaping: ${entry.changed.length}`);
    for (const change of entry.changed) {
      lines.push(`  - \`${change.key}\`: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const option = (/** @type {string} */ name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
  };
  const from = option("from");
  const release = option("release");
  if (!from || !release) {
    console.error("Usage: node scripts/import-legacy.mjs --from <dir> --release <bundle> [--to <dir>] [--report <file.md>]");
    process.exit(2);
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const to = resolve(option("to") ?? join(packageRoot, "messages/legacy"));
  const report = importLegacy({ from: resolve(from), to, release });
  const text = formatReport(report);
  const reportFile = option("report");
  if (reportFile) writeFileSync(resolve(reportFile), `${text}\n`);
  console.log(text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
