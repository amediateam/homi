import { defaultLocale, isLocale } from "@homi/config";
import { type NextRequest, NextResponse } from "next/server";

import { LOCALE_COOKIE } from "@/i18n/routing";

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

/** The request pipeline; WP-21 adds the CSP nonce and the security headers to the same response. */
export function proxy(request: NextRequest): NextResponse {
  return withLocale(request);
}

export const config = {
  // Everything except Next.js internals, the app's own route handlers and files with an extension.
  matcher: ["/((?!_next(?:/|$)|bff(?:/|$)|.*\\..*).*)"],
};
