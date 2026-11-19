// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { clearHistory } = await import("@/lib/actions/history");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  jar.clear();
  jar.set("homi_session", "cookie-token");
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
      return new Response(null, { status: 204 });
    }),
  );
});

describe("clearHistory (WP-29, BR-APP-067)", () => {
  it("DELETE /history with the cookie's token and no body; the 204 is a success with null data", async () => {
    await expect(clearHistory(undefined, undefined, "uz")).resolves.toEqual({ ok: true, data: null, meta: {} });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "https://api.test/api/v1/history", method: "DELETE", body: undefined });
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
  });

  it("takes no input: called bare, as useAction's caller may", async () => {
    await expect(clearHistory()).resolves.toEqual({ ok: true, data: null, meta: {} });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["DELETE", "https://api.test/api/v1/history"]]);
  });

  it("the cookie's token wins over the argument's", async () => {
    await clearHistory(undefined, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await clearHistory(undefined, { token: "header-token" });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["DELETE", "https://api.test/api/v1/history"]]);
    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it.each([
    { row: "no token at all", auth: undefined },
    { row: "an empty argument token", auth: { token: "" } },
  ])("without a session ($row) makes no request and answers unauthorized", async ({ auth }) => {
    jar.clear();

    await expect(clearHistory(undefined, auth)).resolves.toEqual({
      ok: false,
      error: "unauthorized",
      status: 401,
      code: "unauthenticated",
      method: "ACTION",
      path: "session",
    });
    expect(sent).toEqual([]);
  });

  it("any 2xx is a success and its body is not read", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(null, { status: 200 }));

    await expect(clearHistory()).resolves.toEqual({ ok: true, data: null, meta: {} });
  });

  it.each([
    { status: 500, code: "server_error", error: "server" },
    { status: 403, code: "access_denied", error: "forbidden" },
    { status: 503, code: "source_unavailable", error: "source_unavailable" },
  ])("a $status refusal comes back as a failed ActionResult ($error)", async ({ status, code, error }) => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "Refused", code }, { status }));

    await expect(clearHistory()).resolves.toEqual({ ok: false, error, status, code, method: "DELETE", path: "history" });
  });

  it("no answer at all is offline, not a throw", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(clearHistory()).resolves.toEqual({ ok: false, error: "offline", status: 0, method: "DELETE", path: "history" });
  });
});
