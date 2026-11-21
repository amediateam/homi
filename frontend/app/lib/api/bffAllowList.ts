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
] as const;

export type BffRead = (typeof BFF_READS)[number];

const POSITIVE_INTEGER = /^[1-9]\d{0,9}$/;

/** The allow-list entry a concrete path matches (`listings/42` → `listings/:number`), or `null`. */
export function readTemplate(path: string): BffRead | null {
  const exact = BFF_READS.find((read) => read === path);
  if (exact !== undefined) {
    return exact;
  }
  const [first, second, ...rest] = path.split("/");
  return first === "listings" && second !== undefined && rest.length === 0 && POSITIVE_INTEGER.test(second) ? "listings/:number" : null;
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
