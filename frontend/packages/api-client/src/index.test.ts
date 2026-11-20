import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./index";

function client(response: () => Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
  return { api: createApiClient({ baseUrl: "https://api.test/api/v1/", fetch }), fetch };
}

const sentUrl = (fetch: ReturnType<typeof client>["fetch"]) => String(fetch.mock.calls[0]?.[0]);

describe("createApiClient — empty and unreadable bodies (WP-22)", () => {
  it("resolves an empty 2xx body as success with null data, not only a 204", async () => {
    const { api } = client(() => new Response("", { status: 200 }));

    await expect(api.post("listings/1/share")).resolves.toEqual({ success: true, data: null });
  });

  it("still resolves a 204", async () => {
    const { api } = client(() => new Response(null, { status: 204 }));

    await expect(api.delete("favorites/1")).resolves.toEqual({ success: true, data: null });
  });

  it("rejects an unreadable 2xx body", async () => {
    const { api } = client(() => new Response("<html>proxy</html>", { status: 200 }));

    await expect(api.get("me")).rejects.toMatchObject({ name: "ApiError", status: 200, code: "unknown" });
  });

  it("rejects an empty error body with its status", async () => {
    const { api } = client(() => new Response("", { status: 502 }));

    const failure = await api.get("me").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 502, code: "unknown" });
  });
});

describe("createApiClient — the error body (WP-36)", () => {
  it("keeps the envelope's reason when it is a string", async () => {
    const { api } = client(() => Response.json({ success: false, message: "Too many today", code: "rate_limited", reason: "daily" }, { status: 429 }));

    const failure = await api.get("listings/1").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 429, code: "rate_limited", reason: "daily" });
  });

  it("has no reason when the body has none or it is not a string", async () => {
    const caught = (body: unknown) =>
      client(() => Response.json(body, { status: 429 }))
        .api.get("listings/1")
        .then(
          () => null,
          (error: unknown) => error as ApiError,
        );
    const none = await caught({ success: false, message: "x", code: "rate_limited" });
    const odd = await caught({ success: false, message: "x", code: "rate_limited", reason: 7 });

    expect(none).toBeInstanceOf(ApiError);
    expect(none?.reason).toBeUndefined();
    expect(odd).toBeInstanceOf(ApiError);
    expect(odd?.reason).toBeUndefined();
  });
});

describe("createApiClient — query (WP-22)", () => {
  it("accepts URLSearchParams, so a list filter is sent once per value", async () => {
    const { api, fetch } = client(() => Response.json({ success: true, data: [] }));
    const query = new URLSearchParams([
      ["types[]", "apartment"],
      ["types[]", "house"],
      ["city", "tashkent"],
    ]);

    await api.get("listings", { query });

    expect(sentUrl(fetch)).toBe("https://api.test/api/v1/listings?types%5B%5D=apartment&types%5B%5D=house&city=tashkent");
  });

  it("keeps the record form and skips undefined values", async () => {
    const { api, fetch } = client(() => Response.json({ success: true, data: [] }));

    await api.get("listings", { query: { city: "tashkent", limit: 20, owner: undefined } });

    expect(sentUrl(fetch)).toBe("https://api.test/api/v1/listings?city=tashkent&limit=20");
  });
});
