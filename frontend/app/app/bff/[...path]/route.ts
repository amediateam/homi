import { type NextRequest, NextResponse } from "next/server";

import { scrubDeep } from "@/lib/analytics/scrub";
import { isWrite, readTemplate } from "@/lib/api/bffAllowList";
import { STUB_SCENARIO_COOKIE, stubScenarioHeaders } from "@/lib/api/scenario";
import { sameOrigin } from "@/lib/security/sameOrigin";
import { apiBaseUrl, SESSION_COOKIE } from "@/lib/session/server";

/**
 * The read pass-through of the Mini App (WP-22, `25` §3.5): a screen that had no session on the server (header
 * mode) makes the same read through here. Only the reads of `BFF_READS`; same-origin only; the token from the
 * cookie or the bearer header; the query string forwarded as it is (capped at 4 KB) and never logged; the API's
 * status and body passed on unchanged, without its headers — so no `Set-Cookie` — and never cached. The one write is
 * the journal (`POST events`, WP-32): a same-origin JSON body of at most 8 KB, its properties scrubbed again here,
 * forwarded to `POST /events` with the token; its answer is the API's status with no body.
 */

const MAX_QUERY_BYTES = 4096;
const MAX_EVENT_BYTES = 8 * 1024;
const API_TIMEOUT_MS = 15_000;

function refuse(status: number, code: string): NextResponse {
  const response = NextResponse.json({ success: false, message: code, code }, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function tokenOf(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value || (/^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null);
}

/** The journal's write (WP-32): only `events`; the body is checked and scrubbed again before it is forwarded. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  if (!sameOrigin(request, true)) {
    return refuse(403, "forbidden");
  }
  const path = (await params).path.join("/");
  if (!isWrite(path)) {
    return refuse(404, "not_found");
  }
  // A declared length over the limit is refused before the body is read.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_EVENT_BYTES) {
    return refuse(413, "payload_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_EVENT_BYTES) {
    return refuse(413, "payload_too_large");
  }
  let event: unknown;
  try {
    event = JSON.parse(text);
  } catch {
    return refuse(422, "invalid");
  }
  const { name, props } = (typeof event === "object" && event !== null ? event : {}) as { name?: unknown; props?: unknown };
  if (typeof name !== "string" || (props !== undefined && (typeof props !== "object" || props === null || Array.isArray(props)))) {
    return refuse(422, "invalid");
  }
  const token = tokenOf(request);
  if (token === null) {
    return refuse(401, "unauthenticated");
  }

  let api: Response;
  try {
    api = await fetch(`${apiBaseUrl()}/${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Request-Id": crypto.randomUUID().replaceAll("-", ""),
        ...stubScenarioHeaders(request.cookies.get(STUB_SCENARIO_COOKIE)?.value),
      },
      body: JSON.stringify({ name, props: scrubDeep(props ?? {}) }),
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError" ? refuse(504, "gateway_timeout") : refuse(502, "bad_gateway");
  }
  const response = new NextResponse(null, { status: api.status === 200 || api.status === 201 || api.status === 202 ? 204 : api.status });
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

  const token = tokenOf(request);
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
