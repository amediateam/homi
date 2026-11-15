import type { Locale } from "@homi/config";

import { getMessages } from "../../src/index";

type Values = Record<string, string | number>;
type Translate = (key: string, values?: Values) => string;

/**
 * A `t(key, values)` over the real catalogues of `getMessages`, enough ICU for the formatter keys: simple
 * `{name}` arguments and `{n, plural, one {…} few {…} many {…} other {…}}` with `=N` branches. A number is
 * formatted in the locale like next-intl does. A missing key or argument throws, so a test catches a wrong
 * argument name.
 */
export function translator(locale: Locale): Translate {
  const messages = getMessages(locale) as unknown;
  return (key, values = {}) => {
    const message = key
      .split(".")
      .reduce<unknown>(
        (node, part) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined),
        messages,
      );
    if (typeof message !== "string") {
      throw new Error(`No message "${key}" in ${locale}`);
    }
    return render(message, values, locale);
  };
}

function render(message: string, values: Values, locale: Locale): string {
  let out = "";
  let index = 0;
  while (index < message.length) {
    if (message[index] !== "{") {
      out += message[index];
      index += 1;
      continue;
    }
    const end = closing(message, index);
    out += argument(message.slice(index + 1, end), values, locale);
    index = end + 1;
  }
  return out;
}

function closing(message: string, open: number): number {
  let depth = 0;
  for (let index = open; index < message.length; index += 1) {
    if (message[index] === "{") {
      depth += 1;
    } else if (message[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error(`Unbalanced braces in "${message}"`);
}

function value(values: Values, name: string): string | number {
  if (!Object.hasOwn(values, name)) {
    throw new Error(`Missing argument "${name}"`);
  }
  return values[name];
}

function argument(body: string, values: Values, locale: Locale): string {
  const parts = body.split(",");
  const name = parts[0].trim();
  if (parts.length === 1) {
    const plain = value(values, name);
    return typeof plain === "number" ? new Intl.NumberFormat(locale).format(plain) : plain;
  }
  if (parts[1].trim() !== "plural") {
    throw new Error(`Unsupported argument "${body}"`);
  }
  const n = Number(value(values, name));
  const branches = new Map<string, string>();
  const options = parts.slice(2).join(",");
  let index = 0;
  while (index < options.length) {
    const open = options.indexOf("{", index);
    if (open < 0) {
      break;
    }
    const selector = options.slice(index, open).trim();
    const end = closing(options, open);
    branches.set(selector, options.slice(open + 1, end));
    index = end + 1;
  }
  const branch =
    branches.get(`=${n}`) ?? branches.get(new Intl.PluralRules(locale).select(n)) ?? branches.get("other");
  if (branch === undefined) {
    throw new Error(`No plural branch for ${n} in "${body}"`);
  }
  return render(branch, values, locale);
}

/** The thousands separator `Intl` writes for `intlLocale` on this runtime (`ru-RU` uses U+00A0 or U+202F by ICU). */
export function groupSeparator(intlLocale: string): string {
  return new Intl.NumberFormat(intlLocale).formatToParts(1000).find((part) => part.type === "group")?.value ?? "";
}

/** `text` with each `_` replaced by the `ru-RU` thousands separator, e.g. `ru("1_200")`. */
export function ru(text: string): string {
  return text.replaceAll("_", groupSeparator("ru-RU"));
}

/** Runs `run` with the process time zone set to `zone` (Node re-reads `TZ` on assignment), then restores it. */
export function withTimeZone<T>(zone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}
