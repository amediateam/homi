/**
 * The scrubbers of everything that leaves the browser (WP-32; SEC-REQ-022, SEC-REQ-047, TMA-009): the journal bodies,
 * the PostHog properties and, again on the server, the boot-error route. One implementation for all three. They mask
 * Telegram's launch data (`tgWebAppData=…` up to the next `&` or `#`), a bearer token, the session cookie pair, Uzbek
 * phone numbers (`+998` and nine digits, with or without separators, masked to `+998***`) and e-mail addresses.
 */

const LAUNCH_DATA = /tgWebAppData=[^&#\s]*/g;
const BEARER = /\bBearer\s+[\w.~+/=|-]+/gi;
const SESSION = /\bhomi_session=[^;&#\s]*/g;
// `+998` (or `998` alone) and nine more digits, each optionally after a space, a dot, a dash or a bracket.
const PHONE = /(?<!\d)\+?998(?:[\s().-]*\d){9}(?!\d)/g;
const EMAIL = /[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** `value` with launch data, tokens, the session cookie, phone numbers and e-mail addresses masked. */
export function scrubText(value: string): string {
  return value
    .replace(LAUNCH_DATA, "tgWebAppData=***")
    .replace(BEARER, "Bearer ***")
    .replace(SESSION, "homi_session=***")
    .replace(PHONE, "+998***")
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
