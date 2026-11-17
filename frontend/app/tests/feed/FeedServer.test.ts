// @vitest-environment node
import { fromSearchParams } from "@homi/search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ cookies: new Map<string, string>(), headers: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers([...request.headers]),
}));
vi.mock("next/cache", () => ({ io: async () => undefined }));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));
/** The client half is `FeedScreen.test.tsx`'s; here only the props the server hands it. */
vi.mock("@/features/feed/FeedScreen", () => ({ FeedScreen: () => null }));

const { readFirstPage } = await import("@/features/feed/FeedServer");
const { feedListKey, feedQuery } = await import("@/features/feed/feedQuery");

const TELEGRAM_ANDROID = (performance: string) =>
  `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 Telegram-Android/11.2.3 (Google Pixel 8; Android 14; SDK 34; ${performance})`;

interface Sent {
  path: string;
  query: URLSearchParams;
  token: string | undefined;
}

let sent: Sent[] = [];
/** The API's answers by path; a missing one is `{}`. */
let answers: Record<string, () => Response> = {};

const page = (numbers: number[]) =>
  Response.json({
    success: true,
    data: numbers.map((number) => ({ number })),
    meta: { source: "stub", next_cursor: "c2" },
  });
const me = (city: string | null) => Response.json({ success: true, data: { city, locale: "ru" }, meta: {} });

beforeEach(() => {
  sent = [];
  answers = { "/listings": () => page([1, 2]), "/me": () => me("tashkent") };
  request.cookies.clear();
  request.headers.clear();
  request.cookies.set("homi_session", "cookie-token");
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      const address = new URL(String(url));
      const path = address.pathname.replace("/api/v1", "");
      sent.push({ path, query: address.searchParams, token: (init.headers as Record<string, string>).Authorization });
      return (answers[path] ?? (() => Response.json({ success: true, data: {}, meta: {} })))();
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("readFirstPage (WP-24, DEC-44)", () => {
  it("without the session cookie reads nothing: the browser asks once the session is ready", async () => {
    request.cookies.clear();

    await expect(readFirstPage({ city: "tashkent" })).resolves.toEqual({ initial: null, serverSmallOnly: false });
    expect(sent).toEqual([]);
  });

  it("an address with a city: page one of 20 with the cookie's token, the key of that address, no /me", async () => {
    const params = { city: "tashkent", rooms_min: "2", sort: "cheap", from: "map" };

    const { initial } = await readFirstPage(params);

    expect(sent.map((call) => call.path)).toEqual(["/listings"]);
    expect(sent[0].token).toBe("Bearer cookie-token");
    const { filters, sort } = fromSearchParams(params);
    expect(sent[0].query.toString()).toBe(feedQuery(filters, sort).toString());
    expect([...sent[0].query].filter(([name]) => ["city", "rooms_min", "sort", "limit", "from"].includes(name))).toEqual([
      ["city", "tashkent"],
      ["rooms_min", "2"],
      ["sort", "cheap"],
      ["limit", "20"],
    ]);
    expect(initial?.key).toBe(feedListKey(filters, sort));
    expect(initial?.key).toBe("city=tashkent&rooms_min=2&sort=cheap|0");
    expect(initial?.result).toEqual({ ok: true, data: [{ number: 1 }, { number: 2 }], meta: { source: "stub", next_cursor: "c2" } });
  });

  it("the default sort is not sent", async () => {
    await readFirstPage({ city: "tashkent", sort: "new" });

    expect(sent[0].query.has("sort")).toBe(false);
    expect(sent[0].query.get("limit")).toBe("20");
  });

  it("an address without a city: /me first, then page one of the profile's city, which the screen gets as profileCity", async () => {
    const { initial, profileCity } = await readFirstPage({ deal: "sale" });

    expect(sent.map((call) => call.path)).toEqual(["/me", "/listings"]);
    expect(sent[1].query.get("city")).toBe("tashkent");
    expect(initial?.key).toBe("city=tashkent&deal=sale|0");
    expect(profileCity).toBe("tashkent");
  });

  it("an address without a city and a profile in another city: page one of that city (BR-APP-010)", async () => {
    answers["/me"] = () => me("samarkand");

    const { initial, profileCity } = await readFirstPage({ deal: "sale" });

    expect(sent.map((call) => call.path)).toEqual(["/me", "/listings"]);
    expect(sent[1].query.get("city")).toBe("samarkand");
    expect(initial?.key).toBe("city=samarkand&deal=sale|0");
    expect(profileCity).toBe("samarkand");
  });

  it("an invalid city counts as none", async () => {
    const { initial } = await readFirstPage({ city: "not a code" });

    expect(sent.map((call) => call.path)).toEqual(["/me", "/listings"]);
    expect(initial?.key).toBe("city=tashkent|0");

    sent = [];
    answers["/me"] = () => me("samarkand");
    expect((await readFirstPage({ city: "not a code" })).initial?.key).toBe("city=samarkand|0");
  });

  it("an address with a city never asks /me, whatever the profile's city", async () => {
    answers["/me"] = () => me("samarkand");

    const { initial } = await readFirstPage({ city: "andijan" });

    expect(sent.map((call) => call.path)).toEqual(["/listings"]);
    expect(initial?.key).toBe("city=andijan|0");
  });

  it("without a city in the address or the profile, or without /me, nothing is read: the browser knows the saved city", async () => {
    answers["/me"] = () => me(null);
    await expect(readFirstPage({})).resolves.toEqual({ initial: null, serverSmallOnly: false });

    answers["/me"] = () => Response.json({ success: false, code: "server_error", message: "Server error." }, { status: 500 });
    await expect(readFirstPage({ deal: "sale" })).resolves.toEqual({ initial: null, serverSmallOnly: false });

    expect(sent.map((call) => call.path)).toEqual(["/me", "/me"]);
  });

  it("an unauthorized page one or /me leaves page one to the browser, which asks after the sign-in (WP-21)", async () => {
    const refused = () => Response.json({ success: false, code: "unauthenticated", message: "Unauthenticated." }, { status: 401 });
    answers["/listings"] = refused;
    await expect(readFirstPage({ city: "tashkent" })).resolves.toEqual({ initial: null, serverSmallOnly: false });
    expect((await readFirstPage({})).initial).toBeNull();

    answers["/me"] = refused;
    await expect(readFirstPage({ deal: "sale" })).resolves.toEqual({ initial: null, serverSmallOnly: false });
    expect(sent.map((call) => call.path)).toEqual(["/listings", "/me", "/listings", "/me"]);
  });

  it("a failed page one is passed on, not thrown", async () => {
    answers["/listings"] = () => Response.json({ success: false, code: "source_unavailable", message: "The data source is unavailable." }, { status: 503 });

    const { initial } = await readFirstPage({ city: "tashkent" });

    expect(initial?.key).toBe("city=tashkent|0");
    expect(initial?.result).toMatchObject({ ok: false, error: "source_unavailable", status: 503 });
  });

  it.each([
    [{ "save-data": "on" }, true],
    [{ "save-data": "On " }, true],
    [{ "save-data": "off" }, false],
    [{ "user-agent": TELEGRAM_ANDROID("LOW") }, true],
    [{ "user-agent": TELEGRAM_ANDROID("AVERAGE") }, true],
    [{ "user-agent": TELEGRAM_ANDROID("HIGH") }, false],
    [{ "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128.0 Mobile Safari/537.36" }, false],
    [{ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148" }, false],
    [{}, false],
  ])("serverSmallOnly for %o is %s (BR-APP-059)", async (headers, expected) => {
    for (const [name, value] of Object.entries(headers)) {
      request.headers.set(name, value);
    }

    expect((await readFirstPage({ city: "tashkent" })).serverSmallOnly).toBe(expected);
  });
});
