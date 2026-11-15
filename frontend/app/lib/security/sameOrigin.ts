import type { NextRequest } from "next/server";

/**
 * Whether a request to a route of the app comes from the app itself (WP-21, WP-22). A request that says it comes
 * from another site (`Sec-Fetch-Site` other than `same-origin`) or names another `Origin` is refused. A same-origin
 * `GET` carries no `Origin`, so it passes unless `requireOrigin` is set (a `POST` must name the app's origin).
 */
export function sameOrigin(request: NextRequest, requireOrigin: boolean): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") {
    return false;
  }
  if (origin === null) {
    return !requireOrigin;
  }
  try {
    return new URL(origin).host === (request.headers.get("host") ?? request.nextUrl.host);
  } catch {
    return false;
  }
}
