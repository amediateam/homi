import type { ApiSuccess, components } from "@homi/types";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { ApiError, createApiClient } from "./index";
import { createTypedClient } from "./typed";

type MediaFile = components["schemas"]["MediaFileResource"];

/** A fetch double that answers every request with `status` and `body` and records what it was asked. */
function answering(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () =>
    status === 204
      ? new Response(null, { status })
      : new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
  );
}

function clientWith(fetchDouble: ReturnType<typeof answering>) {
  return createApiClient({ baseUrl: "https://api.homi.test/api/v1/", fetch: fetchDouble });
}

function requestOf(fetchDouble: ReturnType<typeof answering>): { url: string; init: RequestInit } {
  const [url, init] = fetchDouble.mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

describe("createTypedClient", () => {
  it("fills the path parameters and the query into the URL", async () => {
    const fetchDouble = answering(200, { success: true, data: { id: "01J" }, meta: { source: "native" } });

    await createTypedClient(clientWith(fetchDouble)).call("get", "/media/{media}", {
      params: { media: "01J X" },
      query: { variant: 640 } as never,
    });

    expect(requestOf(fetchDouble).url).toBe("https://api.homi.test/api/v1/media/01J%20X?variant=640");
    expect(requestOf(fetchDouble).init.method).toBe("GET");
  });

  it("sends the method and the JSON body", async () => {
    const fetchDouble = answering(201, { success: true, data: { key: "uploads/k" } });

    await createTypedClient(clientWith(fetchDouble)).call("post", "/media/register", { body: { key: "uploads/k" } });

    expect(requestOf(fetchDouble).init.method).toBe("POST");
    expect(requestOf(fetchDouble).init.body).toBe('{"key":"uploads/k"}');
  });

  it("refuses a path parameter that is missing", async () => {
    const fetchDouble = answering(200, {});

    await expect(
      createTypedClient(clientWith(fetchDouble)).call("get", "/media/{media}", { params: {} as never }),
    ).rejects.toThrow('Missing path parameter "media"');
    expect(fetchDouble).not.toHaveBeenCalled();
  });

  it("types the call from the OpenAPI paths", () => {
    const typed = createTypedClient(clientWith(answering(200, {})));

    expectTypeOf(typed.call<"get", "/media/{media}">).returns.resolves.toEqualTypeOf<ApiSuccess<MediaFile>>();
    expectTypeOf(typed.call<"delete", "/media/{media}">).returns.resolves.toEqualTypeOf<ApiSuccess<null>>();

    // Checked by `tsc` only (`pnpm typecheck`); never called.
    const refusedByTheCompiler = () => [
      // @ts-expect-error -- `/media/{media}` has no PUT.
      typed.call("put", "/media/{media}", { params: { media: "x" } }),
      // @ts-expect-error -- the path parameter is required.
      typed.call("get", "/media/{media}"),
      // @ts-expect-error -- not a path of the API.
      typed.call("get", "/nothing"),
    ];
    expectTypeOf(refusedByTheCompiler).toBeFunction();
  });
});

describe("createApiClient", () => {
  it("answers 204 No Content with null data instead of an error", async () => {
    const answer = await clientWith(answering(204, null)).delete("/media/01J");

    expect(answer).toEqual({ success: true, data: null });
  });

  it("sends PUT with a JSON body", async () => {
    const fetchDouble = answering(200, { success: true, data: null });

    await clientWith(fetchDouble).put("/settings", { locale: "uz" });

    expect(requestOf(fetchDouble).init.method).toBe("PUT");
    expect(requestOf(fetchDouble).init.body).toBe('{"locale":"uz"}');
  });

  it("maps an error body to ApiError with its code", async () => {
    const fetchDouble = answering(503, { success: false, message: "The data source is unavailable.", code: "source_unavailable" });

    const error = await clientWith(fetchDouble).get("/listings").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: "source_unavailable", message: "The data source is unavailable." });
  });

  it("gives an answer without an envelope the code unknown", async () => {
    const error = await clientWith(answering(502, "<html>Bad Gateway</html>")).get("/listings").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 502, code: "unknown" });
    expectTypeOf<ApiError["code"]>().toEqualTypeOf<string>();
  });
});
