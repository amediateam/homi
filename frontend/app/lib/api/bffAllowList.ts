/**
 * The reads the browser may make through `/bff/*` (WP-22, `25` §3.5): the complete list, so later packages do not
 * touch it. Everything else — every mutation, `auth`, `media` — answers 404; mutations are Server Actions. The one
 * write is `POST events`, the journal (WP-32, `BFF_WRITES`); `boot-error` has a route of its own and is reserved, so
 * the catch-all refuses it.
 */
export const BFF_READS = [
  "me",
  "settings",
  "reference",
  "cities",
  "listings",
  "listings/count",
  "listings/new",
  "listings/flow",
  "listings/map",
  "listings/:number",
  "favorites",
  "history",
  "hidden",
  "radars",
  // The owner form's reads (WP-81).
  "owner/listings",
  "owner/listings/:id",
  // «Отклики» (WP-82), paged by `cursor`.
  "owner/listings/:id/requests",
  "owner/place",
  "owner/demand",
] as const;

export type BffRead = (typeof BFF_READS)[number];

const POSITIVE_INTEGER = /^[1-9]\d{0,9}$/;
/** An owner listing id: a ULID (the WP-80 contract). */
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

/**
 * The allow-list entry a concrete path matches (`listings/42` → `listings/:number`, `owner/listings/<ULID>` →
 * `owner/listings/:id`), or `null`.
 */
export function readTemplate(path: string): BffRead | null {
  const exact = BFF_READS.find((read) => read === path);
  if (exact !== undefined) {
    return exact;
  }
  const [first, second, third, ...rest] = path.split("/");
  if (first === "listings" && second !== undefined && third === undefined && POSITIVE_INTEGER.test(second)) {
    return "listings/:number";
  }
  if (first !== "owner" || second !== "listings" || third === undefined || !ULID.test(third)) {
    return null;
  }
  if (rest.length === 0) {
    return "owner/listings/:id";
  }
  return rest.length === 1 && rest[0] === "requests" ? "owner/listings/:id/requests" : null;
}

/** The writes of `/bff/*`: the journal only (WP-32, `journal.ts`). */
export const BFF_WRITES = ["events"] as const;
export type BffWrite = (typeof BFF_WRITES)[number];

/** Paths with a route of their own, which the catch-all refuses (WP-32: the boot guard's report). */
export const BFF_RESERVED = ["boot-error", "session"] as const;

/** Whether `path` is the one write of the pass-through. */
export function isWrite(path: string): path is BffWrite {
  return (BFF_WRITES as readonly string[]).includes(path);
}
