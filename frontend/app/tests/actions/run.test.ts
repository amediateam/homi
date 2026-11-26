// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
/** The headers of the action's request. */
let incoming = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => incoming,
}));
// Server Actions never read the root parameter (`next-root-params.md`); the module only has to load.
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { runAction } = await import("@/lib/actions/run");
const { listingNumber, ulid } = await import("@/lib/actions/validate");

type Sent = { url: string; method: string; headers: Record<string, string> };
let sent: Sent[] = [];
let answer: () => Response = () => Response.json({ success: true, data: { favorite: true }, meta: { source: "native" } });

/** A test action, written the way the actions of later packages are. */
async function testAction(input: unknown, auth?: { token?: string }, locale?: string) {
  const number = listingNumber(input);
  if (number === null) {
    return runAction.invalid("PUT", "favorites/:number");
  }
  return runAction(auth, locale, (api) => api.putFavorite(number));
}

beforeEach(() => {
  sent = [];
  jar.clear();
  incoming = new Headers();
  answer = () => Response.json({ success: true, data: { favorite: true }, meta: { source: "native" } });
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string> });
      return answer();
    }),
  );
});

describe("runAction (WP-22)", () => {
  it("cookie mode: the cookie's token, the passed locale", async () => {
    jar.set("homi_session", "cookie-token");

    await expect(testAction(42, undefined, "uz")).resolves.toEqual({ ok: true, data: { favorite: true }, meta: { source: "native" } });
    expect(sent[0]).toMatchObject({ url: "https://api.test/api/v1/favorites/42", method: "PUT" });
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
  });

  it("header mode: the argument's token; the cookie wins when both exist", async () => {
    await testAction(42, { token: "header-token" }, "en");
    jar.set("homi_session", "cookie-token");
    await testAction(42, { token: "header-token" }, "en");

    expect(sent.map((call) => call.headers.Authorization)).toEqual(["Bearer header-token", "Bearer cookie-token"]);
  });

  it("refuses without a token and makes no request", async () => {
    await expect(testAction(42)).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toEqual([]);
  });

  it("invalid input makes no request", async () => {
    jar.set("homi_session", "cookie-token");
    for (const input of [0, -1, 1.5, "42", null, "abc", Number.NaN]) {
      await expect(testAction(input), String(input)).resolves.toMatchObject({ ok: false, error: "validation", status: 422 });
    }
    expect(sent).toEqual([]);
  });

  it("a 204 is a success", async () => {
    jar.set("homi_session", "cookie-token");
    answer = () => new Response(null, { status: 204 });

    await expect(testAction(42)).resolves.toEqual({ ok: true, data: null, meta: {} });
  });

  it("passes the action request's X-Forwarded-For on as it came, and none when it has none (WP-40)", async () => {
    jar.set("homi_session", "cookie-token");
    incoming = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    await testAction(42);
    incoming = new Headers();
    await testAction(42);

    expect(sent.map((call) => call.headers["X-Forwarded-For"])).toEqual(["203.0.113.7, 10.0.0.1", undefined]);
  });

  it("an unknown locale falls back to ru", async () => {
    jar.set("homi_session", "cookie-token");

    await testAction(42, undefined, "de");

    expect(sent[0].headers["Accept-Language"]).toBe("ru");
  });
});

describe("validate", () => {
  it("listing numbers are positive integers", () => {
    expect(listingNumber(7)).toBe(7);
    for (const value of [0, -7, 7.5, "7", Number.POSITIVE_INFINITY, undefined]) {
      expect(listingNumber(value), String(value)).toBeNull();
    }
  });

  it("radar and author ids are ULID strings of 26 characters, in either case as Laravel's whereUlid accepts", () => {
    expect(ulid("01HZY8K3X4M5N6P7Q8R9S0T1V2")).toBe("01HZY8K3X4M5N6P7Q8R9S0T1V2");
    expect(ulid("01hzy8k3x4m5n6p7q8r9s0t1v2")).toBe("01hzy8k3x4m5n6p7q8r9s0t1v2");
    for (const value of ["01HZY8K3X4M5N6P7Q8R9S0T1V", "01HZY8K3X4M5N6P7Q8R9S0T1VU", "81HZY8K3X4M5N6P7Q8R9S0T1V2", "../../01HZY8K3X4M5N6P7Q8R", 26, null]) {
      expect(ulid(value), String(value)).toBeNull();
    }
  });
});
