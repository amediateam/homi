/**
 * Input checks of the Server Actions (WP-22): an action validates its input before any request, because nothing
 * from the client is trusted (`authentication-with-cache-components.md`).
 */

/** A listing number: a positive safe integer. */
export function listingNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** A radar or blocked-author id: a ULID as WP-13 issues it; either case, as Laravel's `whereUlid` accepts. */
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

export function ulid(value: unknown): string | null {
  return typeof value === "string" && ULID.test(value) ? value : null;
}

/** One of `allowed` (an enum of the generated types), else `null`. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
