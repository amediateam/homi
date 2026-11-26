import { type NextRequest, NextResponse } from "next/server";

import { forwardedFor, forwardedForHeaders } from "@/lib/api/forwarded";
import { STUB_SCENARIO_COOKIE, stubScenarioHeaders } from "@/lib/api/scenario";
import { cleanSource, limit, MESSAGE_MAX, NAME_MAX, PLATFORM_MAX, SCREEN_MAX, TG_MAX } from "@/lib/errors/sanitize";
import { scrubText } from "@/lib/analytics/scrub";
import { sameOrigin } from "@/lib/security/sameOrigin";
import { apiBaseUrl, SESSION_COOKIE } from "@/lib/session/server";

/**
 * The report endpoint of the boot guard (WP-32; TMA-003, owned by WP-21): the inline boot script posts here by
 * `XMLHttpRequest` when the bundle cannot start, so it has no session helper. Every answer is `204` with no body.
 * Only same-origin JSON of at most 2 KB is read. Of the body only `v` and `error.{kind, name, message, source, stage,
 * screen, tg, platform}` are kept, `kind` and `stage` forced to `boot`, the limits and scrubbers of the browser applied
 * again. With the session cookie it goes on as `app_error` to `POST /events` (the answer ignored); without one — a
 * first launch, header mode, an engine below the floor, which never gets a session — one log line with `v`, `name`,
 * `tg` and `platform` only: no message, no source, no address, nothing stored (SEC-REQ-047). The forwarded report
 * carries the request's `X-Forwarded-For` to the API (WP-40).
 */

const MAX_BYTES = 2048;
const API_TIMEOUT_MS = 5000;

function done(): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function text(value: unknown, max: number): string {
  return scrubText(limit(value, max));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request, false) || !(request.headers.get("content-type") ?? "").startsWith("application/json")) {
    return done();
  }
  // A declared length over the limit is refused before the body is read.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return done();
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return done();
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return done();
  }
  const { v, error } = (typeof body === "object" && body !== null ? body : {}) as { v?: unknown; error?: unknown };
  const given = (typeof error === "object" && error !== null ? error : {}) as Record<string, unknown>;
  const report = {
    v: text(v, 40),
    error: {
      kind: "boot",
      name: limit(given.name, 200).replace(/[^\w.$/-]/g, "").slice(0, NAME_MAX),
      message: text(given.message, MESSAGE_MAX),
      source: typeof given.source === "string" ? cleanSource(given.source) : "",
      stage: "boot",
      screen: text(given.screen, SCREEN_MAX),
      tg: text(given.tg, TG_MAX),
      platform: text(given.platform, PLATFORM_MAX),
    },
  };

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    console.info(JSON.stringify({ event: "boot_error", v: report.v, name: report.error.name, tg: report.error.tg, platform: report.error.platform }));
    return done();
  }
  try {
    await fetch(`${apiBaseUrl()}/events`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Request-Id": crypto.randomUUID().replaceAll("-", ""),
        ...stubScenarioHeaders(request.cookies.get(STUB_SCENARIO_COOKIE)?.value),
        ...forwardedForHeaders(forwardedFor(request.headers)),
      },
      body: JSON.stringify({ name: "app_error", props: report }),
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    // The answer is ignored, a failure too.
  }
  return done();
}
