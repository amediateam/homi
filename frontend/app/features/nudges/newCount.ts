/**
 * The count of a `GET /listings/new` answer that shows the return banner or the fresh pill (WP-38), or `null` for
 * none: only a positive integer (`Number.isInteger(count) && count > 0`, the client half of the fix of LB-APP-048 —
 * legacy's `count <= 0` let a missing count through to a crash). `0`, a missing `count`, `null`, a string or a
 * fraction show nothing and never throw. Its own module: the feed's long return needs it without the radar rules.
 */
export function newCount(data: unknown): number | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { count } = data as { count?: unknown };
  return typeof count === "number" && Number.isInteger(count) && count > 0 ? count : null;
}
