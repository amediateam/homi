// @vitest-environment node
import { createHash } from "node:crypto";

import { syntheticInitData } from "@homi/testing";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/bff/session/route";

const API = "https://api.test/api/v1";
const TOKEN = "7|tokenvalue";
const me = { locale: "uz", locale_chosen: true, currency: "UZS", theme: "dark", city: "tashkent", city_chosen: true, team: false, analytics: null };
const session = { token: TOKEN, token_type: "Bearer", expires_at: "2026-11-16T12:00:00+00:00", user: me };
const launch = syntheticInitData({ id: 4242 });
const userTag = createHash("sha256").update("4242").digest("hex");

function apiAnswers(...answers: ([number, unknown] | [number, unknown, Record<string, string>])[]) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
    const [status, body, headers = {}] = answers.shift() ?? [500, {}];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://app.test/bff/session", {
    method: "POST",
    headers: { host: "app.test", origin: "https://app.test", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(headers: Record<string, string> = {}) {
  return new NextRequest("https://app.test/bff/session", { headers: { host: "app.test", ...headers } });
}

let logs: unknown[][] = [];

beforeEach(() => {
  vi.stubEnv("API_URL", API);
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args));
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  expect(logs, "the handler never logs").toEqual([]);
});

describe("POST /bff/session", () => {
  it("signs in through the API and sets homi_session: HttpOnly, Secure, SameSite=None, Partitioned, the token's expiry", async () => {
    const fetch = apiAnswers([200, { success: true, data: session, meta: { source: "stub" } }]);

    const response = await POST(post({ initData: launch }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: TOKEN, expiresAt: "2026-11-16T12:00:00+00:00", me });
    expect(fetch).toHaveBeenCalledWith(`${API}/auth/telegram`, expect.objectContaining({ method: "POST", body: JSON.stringify({ init_data: launch }) }));
    const cookies = response.headers.getSetCookie();
    const sessionCookie = cookies.find((cookie) => cookie.startsWith("homi_session="));
    expect(sessionCookie).toBeDefined();
    for (const attribute of ["HttpOnly", "Secure", "SameSite=none", "Partitioned", "Path=/", "Expires=Mon, 16 Nov 2026 12:00:00 GMT"]) {
      expect(sessionCookie?.toLowerCase(), attribute).toContain(attribute.toLowerCase());
    }
    expect(response.cookies.get("homi_session")?.value).toBe(TOKEN);
    expect(response.cookies.get("homi_session_user")?.value).toBe(userTag);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a foreign or missing Origin without calling the API", async () => {
    const fetch = apiAnswers();
    expect((await POST(post({ initData: launch }, { origin: "https://evil.example" }))).status).toBe(403);
    const withoutOrigin = new NextRequest("https://app.test/bff/session", { method: "POST", headers: { host: "app.test" }, body: JSON.stringify({ initData: launch }) });
    expect((await POST(withoutOrigin)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a body over 4 KB and a body without initData with 400", async () => {
    const fetch = apiAnswers();
    expect((await POST(post({ initData: "x".repeat(4100) }))).status).toBe(400);
    expect((await POST(post("not json"))).status).toBe(400);
    expect((await POST(post({ initData: 42 }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes the API's 401 code on and deletes the cookies", async () => {
    apiAnswers([401, { success: false, code: "auth_expired", message: "Expired." }]);

    const response = await POST(post({ initData: launch }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "auth_expired" });
    const deleted = response.headers.getSetCookie().filter((cookie) => /^homi_session(_user)?=;/.test(cookie));
    expect(deleted).toHaveLength(2);
    expect(deleted.every((cookie) => /partitioned/i.test(cookie))).toBe(true);
  });

  it("answers 403 with the access reason; an unknown reason is private", async () => {
    apiAnswers([403, { success: false, code: "access_denied", reason: "invite" }], [403, { success: false, code: "access_denied", reason: "weird" }]);
    const first = await POST(post({ initData: launch }));
    expect([first.status, await first.json()]).toEqual([403, { code: "access_denied", reason: "invite" }]);
    expect(await (await POST(post({ initData: launch }))).json()).toEqual({ code: "access_denied", reason: "private" });
  });

  it("passes a 429 on as rate_limited with the API's Retry-After, and keeps the cookies (KI-37)", async () => {
    apiAnswers([429, { success: false, code: "rate_limited", message: "Too Many Attempts." }, { "retry-after": "37" }]);

    const response = await POST(post({ initData: launch }, { cookie: `homi_session=${encodeURIComponent(TOKEN)}; homi_session_user=${userTag}` }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: "rate_limited" });
    expect(response.headers.get("retry-after")).toBe("37");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("a 429 without Retry-After is passed on without one", async () => {
    apiAnswers([429, { success: false, code: "rate_limited" }]);

    const response = await POST(post({ initData: launch }));

    expect([response.status, await response.json()]).toEqual([429, { code: "rate_limited" }]);
    expect(response.headers.has("retry-after")).toBe(false);
  });

  it("passes the request's X-Forwarded-For on to the API as it came, and invents none (WP-40)", async () => {
    const fetch = apiAnswers([200, { success: true, data: session, meta: { source: "native" } }], [200, { success: true, data: session, meta: { source: "native" } }]);

    await POST(post({ initData: launch }, { "x-forwarded-for": "203.0.113.7, 198.51.100.2" }));
    await POST(post({ initData: launch }));

    const forwarded = fetch.mock.calls.map(([, init]) => (init.headers as Record<string, string>)["X-Forwarded-For"]);
    expect(forwarded).toEqual(["203.0.113.7, 198.51.100.2", undefined]);
  });

  it("answers 502 for anything else: a 500, an unreadable body, a network error", async () => {
    apiAnswers([500, { success: false, code: "server_error" }], [200, "<html>"], [200, { success: true, data: { token: 1 } }]);
    expect((await POST(post({ initData: launch }))).status).toBe(502);
    expect((await POST(post({ initData: launch }))).status).toBe(502);
    expect((await POST(post({ initData: launch }))).status).toBe(502);

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect((await POST(post({ initData: launch }))).status).toBe(502);
  });
});

describe("GET /bff/session", () => {
  it("with the cookie reads /me in cookie mode and returns the user tag", async () => {
    const fetch = apiAnswers([200, { success: true, data: me, meta: { source: "stub" } }]);

    const response = await GET(get({ cookie: `homi_session=${encodeURIComponent(TOKEN)}; homi_session_user=${userTag}` }));

    expect(await response.json()).toEqual({ mode: "cookie", me, user: userTag });
    expect(fetch).toHaveBeenCalledWith(`${API}/me`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("with a bearer header answers in header mode", async () => {
    apiAnswers([200, { success: true, data: me, meta: { source: "stub" } }]);
    const response = await GET(get({ authorization: `Bearer ${TOKEN}` }));
    expect(await response.json()).toEqual({ mode: "header", me });
  });

  it("with neither answers mode none without calling the API", async () => {
    const fetch = apiAnswers();
    expect(await (await GET(get())).json()).toEqual({ mode: "none" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes on 401 and the 403 access reason", async () => {
    apiAnswers([401, { success: false, code: "unauthenticated" }], [403, { success: false, code: "access_denied", reason: "blocked" }]);
    const refused = await GET(get({ authorization: `Bearer ${TOKEN}` }));
    expect([refused.status, await refused.json()]).toEqual([401, { code: "unauthenticated" }]);
    const denied = await GET(get({ authorization: `Bearer ${TOKEN}` }));
    expect([denied.status, await denied.json()]).toEqual([403, { code: "access_denied", reason: "blocked" }]);
  });

  it("passes a 429 of /me on as rate_limited with its Retry-After; the cookie stays (KI-37)", async () => {
    apiAnswers([429, { success: false, code: "rate_limited" }, { "retry-after": "12" }]);

    const response = await GET(get({ cookie: `homi_session=${encodeURIComponent(TOKEN)}` }));

    expect([response.status, await response.json()]).toEqual([429, { code: "rate_limited" }]);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("passes the request's X-Forwarded-For on to GET /me as it came (WP-40)", async () => {
    const fetch = apiAnswers([200, { success: true, data: me, meta: { source: "native" } }]);

    await GET(get({ cookie: `homi_session=${TOKEN}`, "x-forwarded-for": "203.0.113.7" }));

    expect((fetch.mock.calls[0]![1].headers as Record<string, string>)["X-Forwarded-For"]).toBe("203.0.113.7");
  });

  it("refuses a cross-site request", async () => {
    const fetch = apiAnswers();
    expect((await GET(get({ cookie: `homi_session=${TOKEN}`, origin: "https://evil.example" }))).status).toBe(403);
    expect((await GET(get({ cookie: `homi_session=${TOKEN}`, "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("stub scenarios (WP-22)", () => {
  const sentScenario = (fetch: ReturnType<typeof apiAnswers>) =>
    (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;

  it("POST and GET copy the homi_stub_scenario cookie into X-Stub-Scenario outside production", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    const signIn = apiAnswers([200, { success: true, data: session, meta: { source: "stub" } }]);
    await POST(post({ initData: launch }, { cookie: "homi_stub_scenario=access_full" }));
    expect(sentScenario(signIn)["X-Stub-Scenario"]).toBe("access_full");

    const read = apiAnswers([200, { success: true, data: me, meta: { source: "stub" } }]);
    await GET(get({ cookie: `homi_session=${TOKEN}; homi_stub_scenario=access_full` }));
    expect(sentScenario(read)["X-Stub-Scenario"]).toBe("access_full");
  });

  it("never in production", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    const signIn = apiAnswers([200, { success: true, data: session, meta: { source: "stub" } }]);
    await POST(post({ initData: launch }, { cookie: "homi_stub_scenario=access_full" }));
    expect(sentScenario(signIn)["X-Stub-Scenario"]).toBeUndefined();
  });
});
