// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/bff/[...path]/route";
import { BFF_READS, readTemplate } from "@/lib/api/bffAllowList";

const API = "https://api.test/api/v1";
const TOKEN = "7|tokenvalue";

function apiAnswer(status = 200, body: unknown = { success: true, data: [], meta: { source: "stub" } }, headers: Record<string, string> = {}) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function read(path: string, headers: Record<string, string> = {}) {
  const request = new NextRequest(`https://app.test/bff/${path}`, { headers: { host: "app.test", ...headers } });
  const segments = new URL(request.url).pathname.replace(/^\/bff\//, "").split("/");
  return GET(request, { params: Promise.resolve({ path: segments }) });
}

const sent = (fetch: ReturnType<typeof apiAnswer>) => {
  const [url, init] = fetch.mock.calls[0];
  return { url: new URL(url), headers: init.headers as Record<string, string> };
};

let logs: unknown[][] = [];

beforeEach(() => {
  vi.stubEnv("API_URL", API);
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args));
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  expect(logs, "the handler never logs").toEqual([]);
});

describe("the read allow-list", () => {
  it("is the complete list of WP-22", () => {
    expect(BFF_READS).toEqual([
      "me",
      "settings",
      "reference",
      "cities",
      "listings",
      "listings/count",
      "listings/new",
      "listings/flow",
      "listings/map",
      "listings/:number",
      "favorites",
      "history",
      "hidden",
      "radars",
    ]);
  });

  it("matches a listing number only as a positive integer", () => {
    expect(readTemplate("listings/42")).toBe("listings/:number");
    for (const path of ["listings/0", "listings/-1", "listings/abc", "listings/1.5", "listings/42/contact", "listings/007"]) {
      expect(readTemplate(path), path).toBeNull();
    }
  });
});

describe("GET /bff/[...path]", () => {
  it.each(["me", "settings", "reference", "cities", "listings", "listings/count", "listings/new", "listings/flow", "listings/map", "listings/42", "favorites", "history", "hidden", "radars"])(
    "passes %s through",
    async (path) => {
      const fetch = apiAnswer();

      const response = await read(path, { cookie: `homi_session=${TOKEN}` });

      expect(response.status).toBe(200);
      expect(sent(fetch).url.href).toBe(`${API}/${path}`);
    },
  );

  it.each(["listings/abc", "listings/42/contact", "events", "auth/telegram", "media/1", "radars/01HZY/relax", "settings/x"])(
    "answers 404 for %s without calling the API",
    async (path) => {
      const fetch = apiAnswer();

      const response = await read(path, { cookie: `homi_session=${TOKEN}` });

      expect(response.status).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("takes the token from the cookie, else from the bearer header", async () => {
    const cookie = apiAnswer();
    await read("me", { cookie: `homi_session=${TOKEN}` });
    expect(sent(cookie).headers.Authorization).toBe(`Bearer ${TOKEN}`);

    const bearer = apiAnswer();
    await read("me", { authorization: "Bearer header-token" });
    expect(sent(bearer).headers.Authorization).toBe("Bearer header-token");

    const none = apiAnswer();
    await read("reference");
    expect(sent(none).headers.Authorization).toBeUndefined();
  });

  it("forwards the query string as it is, the locale and the stub scenario", async () => {
    const fetch = apiAnswer();

    await read("favorites?cursor=abc&limit=20&types%5B%5D=a&types%5B%5D=b", {
      cookie: `homi_session=${TOKEN}; homi_stub_scenario=empty_list`,
      "accept-language": "uz",
    });

    const { url, headers } = sent(fetch);
    expect(url.search).toBe("?cursor=abc&limit=20&types%5B%5D=a&types%5B%5D=b");
    expect(headers["Accept-Language"]).toBe("uz");
    expect(headers["X-Stub-Scenario"]).toBe("empty_list");
  });

  it("refuses a query string over 4 KB", async () => {
    const fetch = apiAnswer();

    const response = await read(`listings?q=${"x".repeat(4096)}`, { cookie: `homi_session=${TOKEN}` });

    expect(response.status).toBe(414);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a foreign Origin and a cross-site fetch; a same-origin GET without Origin passes", async () => {
    const fetch = apiAnswer();

    expect((await read("me", { cookie: `homi_session=${TOKEN}`, origin: "https://evil.example" })).status).toBe(403);
    expect((await read("me", { cookie: `homi_session=${TOKEN}`, "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect((await read("me", { cookie: `homi_session=${TOKEN}`, origin: "https://app.test", "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("passes the API's status and body on unchanged, private and no-store, without Set-Cookie", async () => {
    const body = { success: false, message: "Not found", code: "not_found" };
    apiAnswer(404, body, { "set-cookie": "laravel_session=x; Path=/", "x-powered-by": "PHP" });

    const response = await read("listings/42", { cookie: `homi_session=${TOKEN}` });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("answers 502 when the API cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await read("me", { cookie: `homi_session=${TOKEN}` });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false, code: "bad_gateway" });
  });
});
