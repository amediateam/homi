import { defaultLocale, isLocale } from "@homi/config";
import { type NextRequest, NextResponse } from "next/server";

import { LOCALE_COOKIE } from "@/i18n/routing";
import { cspFromEnv, PERMISSIONS_POLICY, workerCspFromEnv } from "@/lib/security/csp";

/**
 * Locale step of the proxy pipeline (WP-20). A path without a locale prefix is redirected to the same path under the
 * locale of next-intl's cookie, else `ru`; the query string is kept, and the browser carries the launch fragment
 * (`#tgWebAppData=…`) over a redirect whose `Location` has none. `Accept-Language` is not used: it describes the
 * device, while the legacy rule follows the Telegram language (BR-APP-050), which WP-21 applies after sign-in.
 */
export function withLocale(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isLocale(pathname.split("/")[1] ?? "")) {
    return NextResponse.next();
  }
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const url = request.nextUrl.clone();
  url.pathname = `/${cookie && isLocale(cookie) ? cookie : defaultLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

function securityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  // No X-Frame-Options: `frame-ancestors` decides framing, and Telegram Web shows the app in a frame (Q-SEC-012).
  return response;
}

/** A file under `public/maplibre/<version>/` (WP-27): the only files with an extension that the matcher lets in. */
const MAPLIBRE_FILE = /^\/maplibre\/.*\./;

/**
 * MapLibre's worker and its shared module (WP-27, "Basemap and tiles"): the worker runs under the policy of its own
 * response, so the static file gets the worker policy of `lib/security/csp.ts`. The version in the path names the
 * file, so it is cached for a year; it has no nonce and is not a document.
 */
function mapLibreFile(): NextResponse {
  const { header, reportOnly } = workerCspFromEnv();
  const response = NextResponse.next();
  response.headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", header);
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return securityHeaders(response);
}

/**
 * The request pipeline (WP-20, WP-21): the locale redirect, then for a document a fresh nonce in the CSP (ADR-0020).
 * Next.js reads the nonce from the request's `Content-Security-Policy` header and adds it to its own scripts; the
 * root layout reads `x-nonce` for the boot scripts. Documents are never stored (`Cache-Control: no-store`). The
 * MapLibre worker files skip both steps (`mapLibreFile`).
 */
export function proxy(request: NextRequest): NextResponse {
  if (MAPLIBRE_FILE.test(request.nextUrl.pathname)) {
    return mapLibreFile();
  }
  const redirected = withLocale(request);
  if (redirected.headers.has("location")) {
    return securityHeaders(redirected);
  }
  const nonce = btoa(crypto.randomUUID());
  const { header, reportOnly } = cspFromEnv(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", header);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", header);
  response.headers.set("Cache-Control", "no-store");
  return securityHeaders(response);
}

export const config = {
  // Everything except Next.js internals, the app's own route handlers and files with an extension; of the files, only
  // MapLibre's worker and its shared module, which need their own policy.
  matcher: ["/((?!_next(?:/|$)|bff(?:/|$)|.*\\..*).*)", "/maplibre/:path*"],
};
