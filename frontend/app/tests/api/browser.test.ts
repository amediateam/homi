import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reauthenticate = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/session/bootstrap", () => ({ reauthenticate: () => reauthenticate() }));
const reportSource = vi.fn();
vi.mock("@/lib/data/sources", () => ({ reportSource: (...args: unknown[]) => reportSource(...args) }));

const { BFF_TIMEOUT_MS, bffFetch } = await import("@/lib/api/browser");
const { clearAuth, setCookieAuth, setHeaderAuth } = await import("@/lib/session/store");

type Sent = { url: string; headers: Record<string, string>; credentials?: RequestCredentials };
let sent: Sent[] = [];
let answers: (() => Response | Promise<Response>)[] = [];
const ok = (data: unknown = [{ number: 1 }], source = "stub") => () => Response.json({ success: true, data, meta: { source } });
const status = (code: number, body: unknown = { success: false, message: "x", code: "unauthenticated" }) => () => Response.json(body, { status: code });

beforeEach(() => {
  sent = [];
  answers = [];
  reauthenticate.mockReset();
  reportSource.mockReset();
  document.documentElement.lang = "uz";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit & { signal?: AbortSignal }) => {
      sent.push({ url, headers: init.headers as Record<string, string>, credentials: init.credentials });
      const next = answers.shift();
      if (next === undefined) {
        return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
      }
      return next();
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  clearAuth();
});

describe("bffFetch (WP-22)", () => {
  it("reads through /bff with the query and the document's locale; reports the source", async () => {
    setCookieAuth(null);
    answers.push(ok());

    const result = await bffFetch("listings", { query: new URLSearchParams([["types[]", "a"], ["types[]", "b"]]) });

    expect(result).toEqual({ ok: true, data: [{ number: 1 }], meta: { source: "stub" } });
    expect(sent[0].url).toBe("/bff/listings?types%5B%5D=a&types%5B%5D=b");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
    expect(sent[0].credentials).toBe("same-origin");
    expect(reportSource).toHaveBeenCalledWith("stub");
  });

  it("sends the bearer header only in header mode", async () => {
    setCookieAuth(null);
    answers.push(ok(), ok());
    await bffFetch("me");
    setHeaderAuth("header-token", null);
    await bffFetch("me");

    expect(sent.map((call) => call.headers.Authorization)).toEqual([undefined, "Bearer header-token"]);
  });

  it("a 401 re-authenticates once and repeats the read with the new token", async () => {
    setHeaderAuth("old-token", null);
    answers.push(status(401), ok({ id: 1 }, "native"));
    reauthenticate.mockImplementation(async () => {
      setHeaderAuth("new-token", null);
      return true;
    });

    const result = await bffFetch("me");

    expect(result).toMatchObject({ ok: true, data: { id: 1 } });
    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(sent.map((call) => call.headers.Authorization)).toEqual(["Bearer old-token", "Bearer new-token"]);
  });

  it("a second 401 is unauthorized, without a third request", async () => {
    setCookieAuth(null);
    answers.push(status(401), status(401));
    reauthenticate.mockResolvedValue(true);

    await expect(bffFetch("me")).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toHaveLength(2);
    expect(reauthenticate).toHaveBeenCalledTimes(1);
  });

  it("a failed re-authentication does not repeat the read", async () => {
    setCookieAuth(null);
    answers.push(status(401));
    reauthenticate.mockResolvedValue(false);

    await expect(bffFetch("me")).resolves.toMatchObject({ ok: false, error: "unauthorized" });
    expect(sent).toHaveLength(1);
  });

  it("maps the answer with the path template and reports nothing for a failure", async () => {
    setCookieAuth(null);
    answers.push(status(503, { success: false, message: "Source", code: "source_unavailable" }));

    const result = await bffFetch("listings/42", { query: { private: "x" } });

    expect(result).toEqual({ ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "GET", path: "listings/:number" });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(reportSource).not.toHaveBeenCalled();
  });

  it("offline when the request never completes, timeout after 15 s", async () => {
    setCookieAuth(null);
    answers.push(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(bffFetch("me")).resolves.toMatchObject({ ok: false, error: "offline", status: 0 });

    vi.useFakeTimers();
    const pending = bffFetch("me");
    await vi.advanceTimersByTimeAsync(BFF_TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ ok: false, error: "timeout", status: 0 });
    expect(BFF_TIMEOUT_MS).toBe(15_000);
  });

  it("an abort by the caller rejects with the AbortError instead of a result", async () => {
    setCookieAuth(null);
    const controller = new AbortController();
    const pending = bffFetch("me", { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
