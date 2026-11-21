/**
 * The scrubbers of everything that leaves the browser (WP-32; SEC-REQ-022, SEC-REQ-047, TMA-009): the journal bodies,
 * the PostHog properties and, again on the server, the boot-error route. One implementation for all three.
 *
 * The property they keep: a text is judged on its canonical form — percent escapes decoded, up to three passes, one
 * run of escapes at a time and never throwing. A text is replaced whole by `[redacted]` when its canonical form holds
 * a bearer token or the session cookie with a value, or Telegram's launch data (`tgWebAppData`, `query_id`, `user`, `auth_date`, `hash`, `signature` … with a value, or the
 * user object's own keys; quoted, JSON-escaped or bare). Phone numbers — Uzbek ones with `+998`, `998` or `00998`, the nine local digits of a
 * code written as a phone is, `8` before them, any separators (masked to `+998***`), other international numbers (`+`
 * and ten or more digits, masked to `+***`) — and e-mail addresses are masked in place; a text whose canonical form
 * still shows one after that is also replaced whole. Other encodings (`\u0025`, HTML entities, full-width digits) are
 * outside that form. Over-masking a number that is not a phone, or a text that only looks like launch data, is
 * accepted.
 */

export const REDACTED = "[redacted]";

// Seen on the canonical form (JSON escapes such as `\"` and `\n` undone), so an escape before a key or for `=` hides
// nothing. A key may be quoted or bare; a value that starts with `*` is a mask already.
const LAUNCH_MARKS = [
  /(?<![a-z0-9])["']?(?:tgWebAppData|query_id|user|receiver|chat|auth_date|hash|signature|chat_instance|chat_type|start_param)["']?\s*[=:]\s*["']?[^\s&#*"']/i,
  /(?<![a-z0-9])["']?(?:first_name|last_name|username|photo_url|allows_write_to_pm|language_code)["']?\s*[=:]/i,
];
// Like the launch marks, seen on the whole text, queries included: cutting a query at a raw quote or space could part a
// value from its key. A text that only names an address with launch data is therefore redacted; `stripUrl` keeps an
// address's origin and path.
const TOKEN_MARKS = [/(?<![a-z])bearer[\s+:=]*["']?[^\s*"'<>,;]/i, /homi_session["']?\s*[=:]\s*["']?[^\s;&*"']/i];
// Longer texts are cut first: nothing that leaves the app is longer (the journal's bodies are 8 KB), and an unbounded
// text could exhaust a pattern's backtracking.
const TEXT_MAX = 16_384;
const SEPARATOR = "[\\s().+_\\u200b\\u2212\\ufffd\\u2010-\\u2015-]*";
// The percent-encoded separators and plus of an address's query (`%2B998%2090…`), decoded before the phone patterns.
const ENCODED = /%2[0BbDdEe89]/g;
// `+998`, `998` or `00998` and nine more digits, each optionally after a separator (a space, a dot, a bracket, a dash
// of any kind).
const PHONE = new RegExp(`(?<!\\d)(?:\\+|00)?998(?:${SEPARATOR}\\d){9}(?!\\d)`, "g");
const GAP = "[\\s.\\u2010-\\u2015-]?";
// The nine local digits of an Uzbek code (mobile 20, 33, 50, 55, 77, 88, 90 … 99; Tashkent's 71 and 78), written as a
// phone is — code, three, two, two, with at most one separator between — with `8` or brackets or not. A price such as
// «950 000 000» (three, three, three) is not a phone, nor nine digits next to a letter, which are nearly always part of
// an id (a UUID's hex). The `998` and `+` patterns above mask a number next to a letter too.
const LOCAL_PHONE = new RegExp(
  `(?<![\\w+])(?:8${GAP})?\\(?(?:20|33|50|55|71|77|78|88|9\\d)\\)?${GAP}\\d{3}${GAP}\\d{2}${GAP}\\d{2}(?!\\w)`,
  "g",
);
// Any other international number: `+` and ten or more digits.
const INTERNATIONAL = new RegExp(`(?<!\\d)\\+\\d(?:${SEPARATOR}\\d){9,14}(?!\\d)`, "g");
// An address inside a text keeps no query or hash: absolute (any case, `ws` too) or a path after a space. An
// apostrophe belongs to a query (`encodeURIComponent` leaves it, and Uzbek names hold one: O'tkir).
const ADDRESS_QUERY = /((?:https?|wss?):\/\/[^\s?#"'<>]+)[?#][^\s"<>]*/gi;
const PATH_QUERY = /((?:^|\s)\/[\w./-]+)\?[^\s"<>]*/g;
// The local part starts where its run starts (the lookbehind), so a long text without `@` is read once, not once per
// letter; combining marks belong to a letter.
const EMAIL = /(?<![\p{L}\p{M}\p{N}._%+-])[\p{L}\p{M}\p{N}._%+-]+@[\p{L}\p{M}\p{N}.-]+\.\p{L}[\p{L}\p{M}]+/gu;

function phones(text: string): string {
  return text.replace(PHONE, "+998***").replace(INTERNATIONAL, "+***").replace(LOCAL_PHONE, "+998***");
}

/** The length of the UTF-8 sequence that `lead` starts, or 0 for a byte that starts none. */
function sequenceLength(lead: number): number {
  if (lead < 0x80) {
    return 1;
  }
  if (lead >= 0xc2 && lead < 0xe0) {
    return 2;
  }
  if (lead >= 0xe0 && lead < 0xf0) {
    return 3;
  }
  return lead >= 0xf0 && lead < 0xf5 ? 4 : 0;
}

/**
 * A run of percent escapes as UTF-8: every valid sequence decoded, a byte that is not part of one kept as its escape
 * (`%FF%C2%A0` → `%FF` and a no-break space; `%Be` of `%Bearer` stays, so the word survives). Never throws.
 */
function decodeRun(run: string): string {
  const escapes = run.match(/%[0-9A-Fa-f]{2}/g) ?? [];
  const bytes = escapes.map((escape) => Number.parseInt(escape.slice(1), 16));
  let out = "";
  for (let index = 0; index < bytes.length; ) {
    const size = sequenceLength(bytes[index] ?? 0);
    const tail = bytes.slice(index + 1, index + size);
    if (size > 0 && tail.length === size - 1 && tail.every((byte) => byte >= 0x80 && byte < 0xc0)) {
      try {
        out += decodeURIComponent(escapes.slice(index, index + size).join(""));
        index += size;
        continue;
      } catch {
        // An overlong form or a surrogate: kept as written.
      }
    }
    out += escapes[index] ?? "";
    index += 1;
  }
  return out;
}

// One escape of a JSON or JavaScript string: `\u{…}`, `\uXXXX`, `\xHH`, a control letter, or any other character.
const STRING_ESCAPE = /\\(?:u\{([0-9A-Fa-f]{1,6})\}|u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2})|([nrtbfv])|([\s\S]))/g;

/**
 * The escapes of a JSON or JavaScript string undone in one pass from left to right, so `\\u00a0` becomes `\u00a0` and
 * the next pass a no-break space: a code point for `\u{…}`, `\uXXXX` and `\xHH`, a space for `\n` and the like, the
 * character itself for any other (`\"`, `\\`, `\/`).
 */
function unescapeString(text: string): string {
  return text.replace(
    STRING_ESCAPE,
    (escape, point: string | undefined, unit: string | undefined, byte: string | undefined, control: string | undefined, other: string | undefined) => {
      const code = Number.parseInt(point ?? unit ?? byte ?? "", 16);
      if (!Number.isNaN(code)) {
        return code <= 0x10ffff ? String.fromCodePoint(code) : escape;
      }
      return control !== undefined ? " " : (other ?? escape);
    },
  );
}

/**
 * `text` with its percent escapes and string escapes undone, up to three times (`%2520` → `%20` → ` `,
 * `\u0025` → `%`); for judging only.
 */
export function canonical(text: string): string {
  let current = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = unescapeString(current.replace(/(?:%[0-9A-Fa-f]{2})+/g, decodeRun));
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

/**
 * `value` scrubbed (see the top of this file). Numbers are masked first (one written with spaces after `?tel=` would
 * lose its `+998` with the query), then the queries of addresses are cut while they are still one word, then the text
 * is judged for secrets; the encoded separators are decoded for a second pass over numbers, then e-mail addresses.
 */
export function scrubText(value: string): string {
  try {
    return scrubWithin(value.length > TEXT_MAX ? value.slice(0, TEXT_MAX) : value);
  } catch {
    // Never throws: a text that cannot be judged does not leave.
    return REDACTED;
  }
}

function scrubWithin(value: string): string {
  const whole = canonical(value);
  if (TOKEN_MARKS.some((mark) => mark.test(whole)) || LAUNCH_MARKS.some((mark) => mark.test(whole))) {
    return REDACTED;
  }
  const cut = phones(value).replace(ADDRESS_QUERY, "$1").replace(PATH_QUERY, "$1");
  const view = canonical(cut);
  // A number or an address written through escapes cannot be masked in place: its raw form is not its canonical one.
  if (view !== cut && (phones(view) !== view || view.search(EMAIL) !== -1)) {
    return REDACTED;
  }
  const masked = phones(cut.replace(ENCODED, (code) => decodeURIComponent(code))).replace(EMAIL, "***@***");
  const after = canonical(masked);
  return phones(after) === after && after.search(EMAIL) === -1 ? masked : REDACTED;
}

/**
 * `value` with every string scrubbed, through arrays and plain objects down to `depth` levels; anything deeper is
 * `null`. Numbers, booleans and `null` stay; functions, symbols and `undefined` are dropped from objects.
 */
export function scrubDeep(value: unknown, depth = 6): unknown {
  if (typeof value === "string") {
    return scrubText(value);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  if (depth <= 0) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubDeep(item, depth - 1) ?? null);
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const scrubbed = scrubDeep(item, depth - 1);
    if (scrubbed !== undefined) {
      out[key] = scrubbed;
    }
  }
  return out;
}

/**
 * An address with its query and hash removed: an absolute `http(s)` address keeps its origin and path, a path keeps
 * itself; anything else is returned scrubbed. A drawn area, the filters and the launch parameters live in the query
 * and the hash, so they never leave with an address.
 */
export function stripUrl(value: string): string {
  // The query and hash go first, on the raw string; a space, a line break or a backslash before them makes it a text
  // that starts with an address (`new URL` would turn `\n` into `/n` before it is judged).
  const head = value.replace(/[?#][\s\S]*$/, "");
  if (/[\s\\]/.test(head)) {
    return scrubText(value);
  }
  if (head.startsWith("/")) {
    return scrubText(head);
  }
  try {
    const url = new URL(head);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return scrubText(`${url.origin}${url.pathname}`);
    }
  } catch {
    // Not an address.
  }
  return scrubText(value);
}

/** Whether `value` is an absolute address of `origin` (the app's own pages). */
export function isAppAddress(value: string, origin: string): boolean {
  if (!/^https?:\/\//.test(value)) {
    return false;
  }
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}
