/**
 * The reads the browser may make through `/bff/*` (WP-22, `25` §3.5): the complete list, so later packages do not
 * touch it. Everything else — every mutation, `auth`, `events`, `media` — answers 404; mutations are Server Actions.
 * `POST events` and `boot-error` are added by WP-32.
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
