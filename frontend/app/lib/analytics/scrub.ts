/**
 * The scrubbers of everything that leaves the browser (WP-32; SEC-REQ-022, SEC-REQ-047, TMA-009): the journal bodies,
 * the PostHog properties and, again on the server, the boot-error route. One implementation for all three. They mask
 * Telegram's launch data (`tgWebAppData=…` up to the next `&` or `#`, and its decoded fields `query_id`, `user`,
 * `auth_date`, `hash`, `signature`, `chat_instance`, `chat_type`, `start_param`), a bearer token, the session cookie
 * pair, phone numbers — Uzbek ones with `+998`, `998` or `00998`, the nine local digits of a mobile code, `8` before
 * them, any separators (masked to `+998***`), and other international numbers (`+` and nine or more digits, masked to
 * `+***`) — and e-mail addresses. Over-masking a number that is not a phone is accepted.
 */

const LAUNCH_DATA = /tgWebAppData=[^&#\s]*/g;
const LAUNCH_FIELDS = /\b(query_id|user|receiver|chat|auth_date|hash|signature|chat_instance|chat_type|start_param)=[^&#\s]*/g;
const BEARER = /\bBearer\s+[\w.~+/=|-]+/gi;
const SESSION = /\bhomi_session=[^;&#\s]*/g;
const SEPARATOR = "[\\s().\\u2010-\\u2015-]*";
// `+998`, `998` or `00998` and nine more digits, each optionally after a separator (a space, a dot, a bracket, a dash
// of any kind).
const PHONE = new RegExp(`(?<!\\d)(?:\\+|00)?998(?:${SEPARATOR}\\d){9}(?!\\d)`, "g");
// The nine local digits of an Uzbek mobile code (33, 50, 55, 77, 88, 90 … 99), with `8` before them or not.
const LOCAL_PHONE = new RegExp(`(?<![\\d+])(?:8${SEPARATOR})?(?:33|50|55|77|88|9\\d)(?:${SEPARATOR}\\d){7}(?!\\d)`, "g");
// Any other international number: `+` and nine or more digits.
const INTERNATIONAL = new RegExp(`\\+\\d(?:${SEPARATOR}\\d){8,}(?!\\d)`, "g");
const EMAIL = /[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** `value` with launch data, tokens, the session cookie, phone numbers and e-mail addresses masked. */
export function scrubText(value: string): string {
  return value
    .replace(LAUNCH_DATA, "tgWebAppData=***")
    .replace(LAUNCH_FIELDS, "$1=***")
    .replace(BEARER, "Bearer ***")
    .replace(SESSION, "homi_session=***")
    .replace(PHONE, "+998***")
    .replace(INTERNATIONAL, "+***")
    .replace(LOCAL_PHONE, "+998***")
    .replace(EMAIL, "***@***");
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
  if (value.startsWith("/")) {
    return value.replace(/[?#].*$/, "");
  }
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `${url.origin}${url.pathname}`;
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
