// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { setFavorite } = await import("@/lib/actions/favorites");

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
      return Response.json({ success: true, data: { favorite: init.method === "PUT" }, meta: { source: "stub" } });
    }),
  );
});

describe("setFavorite (WP-24, BR-APP-039)", () => {
  it("on: PUT /favorites/{number}, with no body", async () => {
    await expect(setFavorite({ number: 42, on: true }, undefined, "uz")).resolves.toEqual({ ok: true, data: { favorite: true }, meta: { source: "stub" } });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "https://api.test/api/v1/favorites/42", method: "PUT", body: undefined });
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
  });

  it("off: DELETE /favorites/{number}, never a toggle", async () => {
    await expect(setFavorite({ number: 42, on: false })).resolves.toEqual({ ok: true, data: { favorite: false }, meta: { source: "stub" } });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["DELETE", "https://api.test/api/v1/favorites/42"]]);
  });

  it("the same state twice sends the same method twice", async () => {
    await setFavorite({ number: 7, on: true });
    await setFavorite({ number: 7, on: true });
    await setFavorite({ number: 7, on: false });

    expect(sent.map((call) => call.method)).toEqual(["PUT", "PUT", "DELETE"]);
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await setFavorite({ number: 42, on: true }, { token: "header-token" }, "en");

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("an input that fails its check makes no request", async () => {
    const inputs: unknown[] = [
      null,
      42,
      "42",
      [],
      {},
      { number: 42 },
      { on: true },
      { number: 0, on: true },
      { number: -1, on: true },
      { number: 1.5, on: true },
      { number: "42", on: true },
      { number: Number.NaN, on: false },
      { number: 42, on: "yes" },
      { number: 42, on: 1 },
      { number: 42, on: null },
    ];
    for (const input of inputs) {
      await expect(setFavorite(input as never), JSON.stringify(input)).resolves.toEqual({
        ok: false,
        error: "validation",
        status: 422,
        code: "validation_failed",
        method: "PUT",
        path: "favorites/:number",
      });
    }
    expect(sent).toEqual([]);
  });

  it("without a session makes no request", async () => {
    jar.clear();

    await expect(setFavorite({ number: 42, on: true })).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toEqual([]);
  });

  it("a refusal of the API comes back as its UiError", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "Unavailable", code: "source_unavailable" }, { status: 503 }));
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "Not found", code: "not_found" }, { status: 404 }));

    await expect(setFavorite({ number: 42, on: true })).resolves.toMatchObject({ ok: false, error: "source_unavailable", status: 503, method: "PUT", path: "favorites/:number" });
    await expect(setFavorite({ number: 42, on: false })).resolves.toMatchObject({ ok: false, error: "not_found", status: 404, method: "DELETE", path: "favorites/:number" });
  });
});
