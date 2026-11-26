// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { blockAuthor, hideListing, unblockAuthor, unblockAuthorById, unhideAll, unhideListing } = await import("@/lib/actions/hidden");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];

const BLOCKED = { id: "01JD0000000000000000000000", kind: "phone", label: "+998 ** *** ** 67", count: 3, listing_numbers: [100001, 101001, 101005] };

beforeEach(() => {
  sent = [];
  jar.clear();
  jar.set("homi_session", "cookie-token");
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
      if (String(url).endsWith("/blocked-author") && init.method === "PUT") {
        return Response.json({ success: true, data: BLOCKED, meta: { source: "stub" } });
      }
      return new Response(null, { status: 204 });
    }),
  );
});

describe("hideListing and unhideListing (WP-26)", () => {
  it("hide: PUT /hidden/listings/{number}; the 204 is a success with null data", async () => {
    await expect(hideListing({ number: 100001 }, undefined, "en")).resolves.toEqual({ ok: true, data: null, meta: {} });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "https://api.test/api/v1/hidden/listings/100001", method: "PUT", body: undefined });
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("en");
  });

  it("unhide: DELETE /hidden/listings/{number}", async () => {
    await expect(unhideListing({ number: 100001 })).resolves.toEqual({ ok: true, data: null, meta: {} });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["DELETE", "https://api.test/api/v1/hidden/listings/100001"]]);
  });
});

describe("blockAuthor and unblockAuthor (WP-26)", () => {
  it("block: PUT /listings/{number}/blocked-author answers the author and the hidden numbers", async () => {
    await expect(blockAuthor({ number: 100001 })).resolves.toEqual({ ok: true, data: BLOCKED, meta: { source: "stub" } });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["PUT", "https://api.test/api/v1/listings/100001/blocked-author"]]);
  });

  it("unblock: DELETE /listings/{number}/blocked-author", async () => {
    await expect(unblockAuthor({ number: 100001 })).resolves.toEqual({ ok: true, data: null, meta: {} });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["DELETE", "https://api.test/api/v1/listings/100001/blocked-author"]]);
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await blockAuthor({ number: 100001 }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("a refusal of the API comes back as its UiError", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "Unavailable", code: "source_unavailable" }, { status: 503 }));

    await expect(blockAuthor({ number: 100001 })).resolves.toEqual({
      ok: false,
      error: "source_unavailable",
      status: 503,
      code: "source_unavailable",
      method: "PUT",
      path: "listings/:number/blocked-author",
    });
  });
});

describe("the input check of the four actions", () => {
  it("an input that fails its check makes no request and answers validation", async () => {
    const actions = [
      [hideListing, "PUT", "hidden/listings/:number"],
      [unhideListing, "DELETE", "hidden/listings/:number"],
      [blockAuthor, "PUT", "listings/:number/blocked-author"],
      [unblockAuthor, "DELETE", "listings/:number/blocked-author"],
    ] as const;
    const inputs: unknown[] = [null, 42, "42", [], {}, { number: 0 }, { number: -1 }, { number: 1.5 }, { number: "42" }, { number: Number.NaN }];
    for (const [action, method, path] of actions) {
      for (const input of inputs) {
        await expect(action(input as never), `${method} ${path} ${JSON.stringify(input)}`).resolves.toEqual({
          ok: false,
          error: "validation",
          status: 422,
          code: "validation_failed",
          method,
          path,
        });
      }
    }
    expect(sent).toEqual([]);
  });

  it("without a session makes no request", async () => {
    jar.clear();

    await expect(hideListing({ number: 100001 })).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toEqual([]);
  });
});

describe("unblockAuthorById and unhideAll (WP-31, «Скрытое»)", () => {
  it("DELETE /hidden/authors/{id} by the entry id of the hidden list", async () => {
    await expect(unblockAuthorById({ id: "01JD0000000000000000000011" })).resolves.toMatchObject({ ok: true, data: null });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["DELETE", "https://api.test/api/v1/hidden/authors/01JD0000000000000000000011"]]);
  });

  it("an id that is not a ULID makes no request", async () => {
    for (const input of [{ id: "" }, { id: "../me" }, { id: "01JD000000000000000000001" }, { id: 7 }, null, {}]) {
      await expect(unblockAuthorById(input as never), JSON.stringify(input)).resolves.toMatchObject({ ok: false, error: "validation" });
    }
    expect(sent).toEqual([]);
  });

  it("DELETE /hidden returns everything; header mode carries the token", async () => {
    jar.clear();
    await expect(unhideAll(null, { token: "header-token" })).resolves.toMatchObject({ ok: true, data: null });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["DELETE", "https://api.test/api/v1/hidden"]]);
    expect(sent[0]?.headers.Authorization).toBe("Bearer header-token");
  });
});
