// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/bff/owner/listings/[id]/photos/route";

const API = "https://api.test/api/v1";
const ID = "01HZY8K3X4M5N6P7Q8R9S0T1V2";
let fetch: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

beforeEach(() => {
  vi.stubEnv("API_URL", API);
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
  fetch = vi.fn(async () => Response.json({ success: true, data: { id: "photo" } }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function upload(headers: Record<string, string> = {}) {
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "photo.jpg");
  const request = new NextRequest(`https://app.test/bff/owner/listings/${ID}/photos`, {
    method: "POST",
    body,
    headers: { host: "app.test", origin: "https://app.test", authorization: "Bearer 7|token", ...headers },
  });
  return POST(request, { params: Promise.resolve({ id: ID }) });
}

describe("POST /bff/owner/listings/{id}/photos (WP-81)", () => {
  it("passes the request's X-Forwarded-For on to the API as it came, and invents none (WP-40)", async () => {
    expect((await upload({ "x-forwarded-for": "203.0.113.7, 198.51.100.2" })).status).toBe(201);
    expect((await upload()).status).toBe(201);

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`${API}/owner/listings/${ID}/photos`, `${API}/owner/listings/${ID}/photos`]);
    const forwarded = fetch.mock.calls.map(([, init]) => (init.headers as Record<string, string>)["X-Forwarded-For"]);
    expect(forwarded).toEqual(["203.0.113.7, 198.51.100.2", undefined]);
  });
});
