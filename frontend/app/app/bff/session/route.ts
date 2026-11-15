import { type NextRequest, NextResponse } from "next/server";

import { apiBaseUrl, SESSION_COOKIE, SESSION_USER_COOKIE, telegramUserTag } from "@/lib/session/server";
import { accessReason } from "@/lib/session/types";

/**
 * The session exchange of the Mini App (WP-21, `25` §3.4, ADR-0018). `POST` trades Telegram's launch data for an
 * API token once per launch and sets it as the `homi_session` cookie; `GET` reads `/me` with the cookie or a bearer
 * header and tells the client which mode it is in. Nothing is cached, and no body, header or token is ever logged.
 */

const MAX_BODY_BYTES = 4096;
const API_TIMEOUT_MS = 15_000;

const cookieAttributes = { httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/" } as const;

function answer(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function clearSession(response: NextResponse): NextResponse {
  for (const name of [SESSION_COOKIE, SESSION_USER_COOKIE]) {
    response.cookies.set(name, "", { ...cookieAttributes, maxAge: 0 });
  }
  return response;
}

/** `POST` needs the app's own `Origin`; any request is refused when it says it comes from another site. */
function sameOrigin(request: NextRequest, requireOrigin: boolean): boolean {
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

type ApiAnswer = { status: number; body: Record<string, unknown> | null } | { status: 0; body: null };

async function callApi(path: string, init: { method: "GET" | "POST"; body?: string; token?: string }): Promise<ApiAnswer> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (init.token !== undefined) {
    headers.Authorization = `Bearer ${init.token}`;
  }
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: init.method,
      headers,
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    let body: Record<string, unknown> | null = null;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function refusal(api: ApiAnswer): NextResponse | null {
  if (api.status === 401) {
    return answer({ code: typeof api.body?.code === "string" ? api.body.code : "unauthenticated" }, 401);
  }
  if (api.status === 403) {
    return answer({ code: "access_denied", reason: accessReason(api.body?.reason) }, 403);
  }
  return null;
}

function telegramUserId(initData: string): number | null {
  try {
    const user = JSON.parse(new URLSearchParams(initData).get("user") ?? "null") as { id?: unknown } | null;
    return typeof user?.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request, true)) {
    return answer({ code: "forbidden" }, 403);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return answer({ code: "payload_too_large" }, 400);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return answer({ code: "payload_too_large" }, 400);
  }
  let initData: unknown = null;
  try {
    initData = (JSON.parse(raw) as { initData?: unknown }).initData;
  } catch {
    initData = null;
  }
  if (typeof initData !== "string" || initData === "") {
    return answer({ code: "validation_failed" }, 400);
  }

  const api = await callApi("/auth/telegram", { method: "POST", body: JSON.stringify({ init_data: initData }) });
  const refused = refusal(api);
  if (refused !== null) {
    return api.status === 401 ? clearSession(refused) : refused;
  }
  const data = api.status === 200 ? (api.body?.data as Record<string, unknown> | undefined) : undefined;
  const token = data?.token;
  const expiresAt = data?.expires_at;
  const expires = typeof expiresAt === "string" ? new Date(expiresAt) : null;
  if (typeof token !== "string" || token === "" || expires === null || Number.isNaN(expires.getTime()) || typeof data?.user !== "object") {
    return answer({ code: "bad_gateway" }, 502);
  }

  const response = answer({ token, expiresAt, me: data.user });
  response.cookies.set(SESSION_COOKIE, token, { ...cookieAttributes, expires });
  const userId = telegramUserId(initData);
  if (userId !== null) {
    response.cookies.set(SESSION_USER_COOKIE, telegramUserTag(userId), { ...cookieAttributes, expires });
  }
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request, false)) {
    return answer({ code: "forbidden" }, 403);
  }
  const cookie = request.cookies.get(SESSION_COOKIE)?.value || null;
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  const token = cookie ?? bearer;
  if (token === null) {
    return answer({ mode: "none" });
  }
  const mode = cookie !== null ? "cookie" : "header";

  const api = await callApi("/me", { method: "GET", token });
  const refused = refusal(api);
  if (refused !== null) {
    return api.status === 401 && mode === "cookie" ? clearSession(refused) : refused;
  }
  const me = api.status === 200 ? api.body?.data : undefined;
  if (typeof me !== "object" || me === null) {
    return answer({ code: "bad_gateway" }, 502);
  }
  return answer(mode === "cookie" ? { mode, me, user: request.cookies.get(SESSION_USER_COOKIE)?.value ?? null } : { mode, me });
}
