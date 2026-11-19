import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "uz" }));

const { API_TIMEOUT_MS, publicApi, serverApi } = await import("@/lib/api/server");

type Sent = { url: URL; headers: Record<string, string>; method: string; body: unknown };
let sent: Sent[] = [];
let answer: () => Response | Promise<Response> = () => Response.json({ success: true, data: { id: 1 }, meta: { source: "stub" } });

beforeEach(() => {
  sent = [];
  answer = () => Response.json({ success: true, data: { id: 1 }, meta: { source: "stub" } });
  jar.clear();
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: new URL(url), headers: init.headers as Record<string, string>, method: String(init.method), body: init.body });
      return answer();
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("serverApi (WP-22)", () => {
  it("sends the cookie's token, the locale as Accept-Language and a request id", async () => {
    jar.set("homi_session", "cookie-token");

    const result = await (await serverApi()).me();

    expect(result).toEqual({ ok: true, data: { id: 1 }, meta: { source: "stub" } });
    expect(sent[0].url.href).toBe("https://api.test/api/v1/me");
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
    expect(sent[0].headers["X-Request-Id"]).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
  });

  it("takes the argument's token when there is no cookie, and the cookie first when there is", async () => {
    await (await serverApi({ token: "header-token" }, "en")).me();
    jar.set("homi_session", "cookie-token");
    await (await serverApi({ token: "header-token" }, "en")).me();

    expect(sent.map((call) => call.headers.Authorization)).toEqual(["Bearer header-token", "Bearer cookie-token"]);
    expect(sent[0].headers["Accept-Language"]).toBe("en");
  });

  it("sends a list filter once per value", async () => {
    const query = new URLSearchParams([
      ["types[]", "apartment"],
      ["types[]", "house"],
    ]);

    await (await serverApi()).listings(query);

    expect(sent[0].url.searchParams.getAll("types[]")).toEqual(["apartment", "house"]);
  });

  it("fills a path parameter and names the template in a failure", async () => {
    answer = () => Response.json({ success: false, message: "Not found", code: "not_found" }, { status: 404 });

    const result = await (await serverApi()).listing(42);

    expect(sent[0].url.pathname).toBe("/api/v1/listings/42");
    expect(result).toEqual({ ok: false, error: "not_found", status: 404, code: "not_found", method: "GET", path: "listings/:number" });
  });

  it("a failure holds no header, query string, body or token (SEC-REQ-047)", async () => {
    jar.set("homi_session", "secret-token");
    answer = () => Response.json({ success: false, message: "Boom", code: "server_error" }, { status: 500 });

    const result = await (await serverApi()).listings(new URLSearchParams({ city: "tashkent", q: "private" }));

    const text = JSON.stringify(result);
    expect(result).toMatchObject({ ok: false, error: "server", status: 500, path: "listings" });
    for (const secret of ["secret-token", "tashkent", "private", "Bearer", "Boom"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("radars: the plain list sends no query, the radar tab's list asks for the previews (WP-30)", async () => {
    await (await serverApi()).radars();
    await (await serverApi()).radars(new URLSearchParams({ include: "previews" }));

    expect(sent.map((call) => [call.method, call.url.pathname, call.url.search])).toEqual([
      ["GET", "/api/v1/radars", ""],
      ["GET", "/api/v1/radars", "?include=previews"],
    ]);
  });

  it("relaxRadar posts the option's code as the body (WP-30, RelaxRadarRequest)", async () => {
    await (await serverApi()).relaxRadar("01JD0000000000000000000001", { code: "price_more" });

    expect(sent[0].method).toBe("POST");
    expect(sent[0].url.pathname).toBe("/api/v1/radars/01JD0000000000000000000001/relax");
    expect(JSON.parse(String(sent[0].body))).toEqual({ code: "price_more" });
  });

  it("a 204 is ok with null data", async () => {
    answer = () => new Response(null, { status: 204 });

    await expect((await serverApi()).deleteFavorite(7)).resolves.toEqual({ ok: true, data: null, meta: {} });
    expect(sent[0].method).toBe("DELETE");
  });

  it("does not throw when the request never completes", async () => {
    answer = () => Promise.reject(new TypeError("fetch failed"));

    await expect((await serverApi()).me()).resolves.toMatchObject({ ok: false, error: "offline", status: 0 });
  });

  it("gives up after 15 s with timeout", async () => {
    vi.useFakeTimers();
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    const pending = (await serverApi()).me();
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);

    await expect(pending).resolves.toMatchObject({ ok: false, error: "timeout", status: 0 });
    expect(API_TIMEOUT_MS).toBe(15_000);
  });

  describe("stub scenarios", () => {
    it("copies the homi_stub_scenario cookie into X-Stub-Scenario outside production", async () => {
      jar.set("homi_stub_scenario", "empty_feed");

      await (await serverApi()).listings(new URLSearchParams());

      expect(sent[0].headers["X-Stub-Scenario"]).toBe("empty_feed");
    });

    it("ignores a value outside ^[a-z0-9_]{1,40}$", async () => {
      jar.set("homi_stub_scenario", "Empty-Feed");

      await (await serverApi()).me();

      expect(sent[0].headers["X-Stub-Scenario"]).toBeUndefined();
    });

    it("never sends it in production", async () => {
      vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
      jar.set("homi_stub_scenario", "empty_feed");

      await (await serverApi()).me();

      expect(sent[0].headers["X-Stub-Scenario"]).toBeUndefined();
    });
  });
});

describe("publicApi (WP-22)", () => {
  it("sends neither a token nor a stub scenario, whatever the cookies say", async () => {
    jar.set("homi_session", "cookie-token");
    jar.set("homi_stub_scenario", "empty_feed");

    await publicApi("ru").reference();

    expect(sent[0].url.pathname).toBe("/api/v1/reference");
    expect(sent[0].headers.Authorization).toBeUndefined();
    expect(sent[0].headers["X-Stub-Scenario"]).toBeUndefined();
    expect(sent[0].headers["Accept-Language"]).toBe("ru");
  });
});
