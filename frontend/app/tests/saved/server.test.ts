// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ cookies: new Map<string, string>(), headers: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers([...request.headers]),
}));
/** The order of `io()` and the random render id: the id is drawn only after `io()` (the runtime shell stage, `io.md`). */
const order = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({
  io: async () => {
    order.push("io");
  },
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));
/** The client halves are `FavoritesScreen.test.tsx`'s and `HistoryScreen.test.tsx`'s; here only the props the server hands them. */
vi.mock("@/features/feed/FeedScreen", () => ({ FeedScreen: () => null }));
vi.mock("@/features/saved/FavoritesScreen", () => ({ FavoritesScreen: () => null }));
vi.mock("@/features/saved/HistoryScreen", () => ({ HistoryScreen: () => null }));

const { readSaved } = await import("@/features/saved/server");
const { savedListKey } = await import("@/features/saved/listKey");
const { FIRST_VERSION } = await import("@/features/feed/feedQuery");

const SOURCES = ["favorites", "history"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TELEGRAM_ANDROID = (performance: string) =>
  `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 Telegram-Android/11.2.3 (Google Pixel 8; Android 14; SDK 34; ${performance})`;

interface Sent {
  method: string;
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

beforeEach(() => {
  sent = [];
  answers = { "/favorites": () => page([1, 2]), "/history": () => page([3, 4]) };
  request.cookies.clear();
  request.headers.clear();
  request.cookies.set("homi_session", "cookie-token");
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      const address = new URL(String(url));
      const path = address.pathname.replace("/api/v1", "");
      sent.push({
        method: String(init.method),
        path,
        query: address.searchParams,
        token: (init.headers as Record<string, string>).Authorization,
      });
      return (answers[path] ?? (() => Response.json({ success: true, data: {}, meta: {} })))();
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(SOURCES)("readSaved(%s) (WP-29, DEC-44)", (source) => {
  it("without the session cookie reads nothing, and still names its render: the browser asks once the session is ready", async () => {
    request.cookies.clear();

    const props = await readSaved(source);

    expect(props).toEqual({ initial: null, renderId: expect.stringMatching(UUID), serverSmallOnly: false });
    expect(sent).toEqual([]);
  });

  it("with the cookie: page one of its own list with no query (no limit) and the cookie's token, keyed by this render", async () => {
    const { initial, renderId } = await readSaved(source);

    expect(sent.map((call) => [call.method, call.path])).toEqual([["GET", `/${source}`]]);
    expect(sent[0].query.toString()).toBe("");
    expect(sent[0].query.has("limit")).toBe(false);
    expect(sent[0].token).toBe("Bearer cookie-token");
    expect(renderId).toMatch(UUID);
    expect(initial?.key).toBe(savedListKey(source, renderId, FIRST_VERSION));
    expect(initial?.key).toBe(`${source}:${renderId}:0`);
    const numbers = source === "favorites" ? [1, 2] : [3, 4];
    expect(initial?.result).toEqual({ ok: true, data: numbers.map((number) => ({ number })), meta: { source: "stub", next_cursor: "c2" } });
  });

  it.each([false, true])("draws the renderId only after io(), with the cookie %s (partialPrefetching's runtime shell)", async (cookie) => {
    if (cookie) {
      request.cookies.set("homi_session", "cookie-token");
    }
    order.length = 0;
    const draw = crypto.randomUUID.bind(crypto);
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      order.push("uuid");
      return draw();
    });

    await readSaved(source);

    expect(order.indexOf("io")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("io")).toBeLessThan(order.indexOf("uuid"));
  });

  it("a new renderId per call, so every server render of the page re-creates the list", async () => {
    const first = await readSaved(source);
    const second = await readSaved(source);
    request.cookies.clear();
    const third = await readSaved(source);

    expect(new Set([first.renderId, second.renderId, third.renderId]).size).toBe(3);
    expect(first.initial?.key).not.toBe(second.initial?.key);
    expect(second.initial?.key).toBe(`${source}:${second.renderId}:0`);
  });

  it("an unauthorized page one leaves it to the browser, which asks after the sign-in (WP-21)", async () => {
    answers[`/${source}`] = () => Response.json({ success: false, code: "unauthenticated", message: "Unauthenticated." }, { status: 401 });

    const props = await readSaved(source);

    expect(props).toEqual({ initial: null, renderId: expect.stringMatching(UUID), serverSmallOnly: false });
    expect(sent).toHaveLength(1);
  });

  it.each([
    {
      row: "503 source_unavailable",
      answer: () => Response.json({ success: false, code: "source_unavailable", message: "The data source is unavailable." }, { status: 503 }),
      failure: { error: "source_unavailable", status: 503, code: "source_unavailable" },
    },
    {
      row: "500",
      answer: () => Response.json({ success: false, code: "server_error", message: "Server error." }, { status: 500 }),
      failure: { error: "server", status: 500 },
    },
    {
      row: "403",
      answer: () => Response.json({ success: false, code: "access_denied", message: "Forbidden." }, { status: 403 }),
      failure: { error: "forbidden", status: 403 },
    },
    {
      row: "offline",
      answer: () => {
        throw new TypeError("fetch failed");
      },
      failure: { error: "offline", status: 0 },
    },
  ])("a failed page one ($row) is passed on with the key of this render, not thrown", async ({ answer, failure }) => {
    answers[`/${source}`] = answer;

    const { initial, renderId } = await readSaved(source);

    expect(initial?.key).toBe(`${source}:${renderId}:0`);
    expect(initial?.result).toMatchObject({ ok: false, ...failure, method: "GET", path: source });
  });

  it.each([
    [{ "save-data": "on" }, true],
    [{ "save-data": "On " }, true],
    [{ "save-data": "off" }, false],
    [{ "user-agent": TELEGRAM_ANDROID("LOW") }, true],
    [{ "user-agent": TELEGRAM_ANDROID("AVERAGE") }, true],
    [{ "user-agent": TELEGRAM_ANDROID("HIGH") }, false],
    [{ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148" }, false],
    [{}, false],
  ])("serverSmallOnly for %o is %s, with the cookie or without (BR-APP-059)", async (headers, expected) => {
    for (const [name, value] of Object.entries(headers)) {
      request.headers.set(name, value);
    }

    expect((await readSaved(source)).serverSmallOnly).toBe(expected);
    request.cookies.clear();
    expect((await readSaved(source)).serverSmallOnly).toBe(expected);
  });
});
