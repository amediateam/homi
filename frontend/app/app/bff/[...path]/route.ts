import { type NextRequest, NextResponse } from "next/server";

import { readTemplate } from "@/lib/api/bffAllowList";
import { STUB_SCENARIO_COOKIE, stubScenarioHeaders } from "@/lib/api/scenario";
import { sameOrigin } from "@/lib/security/sameOrigin";
import { apiBaseUrl, SESSION_COOKIE } from "@/lib/session/server";

/**
 * The read pass-through of the Mini App (WP-22, `25` §3.5): a screen that had no session on the server (header
 * mode) makes the same read through here. Only the reads of `BFF_READS`; same-origin only; the token from the
 * cookie or the bearer header; the query string forwarded as it is (capped at 4 KB) and never logged; the API's
 * status and body passed on unchanged, without its headers — so no `Set-Cookie` — and never cached.
 */

const MAX_QUERY_BYTES = 4096;
const API_TIMEOUT_MS = 15_000;

function refuse(status: number, code: string): NextResponse {
  const response = NextResponse.json({ success: false, message: code, code }, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  if (!sameOrigin(request, false)) {
    return refuse(403, "forbidden");
  }
  const path = (await params).path.join("/");
  if (readTemplate(path) === null) {
    return refuse(404, "not_found");
  }
  const query = request.nextUrl.search;
  if (new TextEncoder().encode(query).length > MAX_QUERY_BYTES) {
    return refuse(414, "query_too_long");
  }

  const token =
    request.cookies.get(SESSION_COOKIE)?.value || (/^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Request-Id": crypto.randomUUID().replaceAll("-", ""),
    ...stubScenarioHeaders(request.cookies.get(STUB_SCENARIO_COOKIE)?.value),
  };
  const locale = request.headers.get("accept-language");
  if (locale !== null) {
    headers["Accept-Language"] = locale;
  }
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  let api: Response;
  try {
    api = await fetch(`${apiBaseUrl()}/${path}${query}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError" ? refuse(504, "gateway_timeout") : refuse(502, "bad_gateway");
  }

  const response = new NextResponse(api.status === 204 ? null : await api.arrayBuffer(), { status: api.status });
  response.headers.set("Content-Type", api.headers.get("content-type") ?? "application/json");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
