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
