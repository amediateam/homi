import "server-only";

/**
 * The client's address chain on the app's own API calls (WP-40): every API request goes out from the app server, so
 * without it the API's per-address limits (`v1-auth`, `v1-public`) would put every user into the app server's one
 * bucket. Each server-side call therefore passes on the `X-Forwarded-For` of the request it serves — nginx in front of
 * the app sets it — as it came: nothing is parsed, checked or appended here, and nothing is sent when the request had
 * none. The API believes it only from the addresses of its `TRUSTED_PROXIES`. Server code only: the browser never
 * sends it, and the cached public reads (`publicApi`) serve every user, so they pass none.
 */

/** The incoming request's `X-Forwarded-For` as it came; `null` when it has none. */
export function forwardedFor(incoming: Pick<Headers, "get">): string | null {
  return incoming.get("x-forwarded-for");
}

/** The header to add to an outgoing API request: that value unchanged, or nothing for `null` or an empty value. */
export function forwardedForHeaders(value: string | null | undefined): Record<string, string> {
  return typeof value === "string" && value !== "" ? { "X-Forwarded-For": value } : {};
}
