import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/bff/boot-error/route";

const API = "https://api.test/api/v1";
let logs: unknown[][] = [];
let fetch: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

beforeEach(() => {
  vi.stubEnv("API_URL", API);
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args));
  }
  fetch = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("https://app.test/bff/boot-error", {
      method: "POST",
      body,
      headers: { host: "app.test", origin: "https://app.test", "content-type": "application/json", ...headers },
    }),
  );
}

const ENTRY = {
  v: "2026.11.21",
  error: {
    kind: "error",
    name: "ChunkLoadError",
    // A query of its own is cut and the number masked; a message that names launch data is redacted whole (scrub.test.ts).
    message: "failed to load https://app.test/_next/static/a.js?dpl=x for +998901234567",
    source: "https://app.test/_next/static/a.js?v=1#tgWebAppData=x:3:4",
    stage: "app",
    screen: "search/list",
    tg: "7.10",
    platform: "android",
    extra: "dropped",
  },
  initData: "query_id=AAA",
};

describe("POST /bff/boot-error (WP-32, TMA-003)", () => {
  it("with the session cookie: one app_error to POST /events with the token; kind and stage forced to boot; extra fields dropped; scrubbed", async () => {
    const response = await post(JSON.stringify(ENTRY), { cookie: "homi_session=7%7Ctoken" });

    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${API}/events`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer 7|token");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "app_error",
      props: {
        v: "2026.11.21",
        error: {
          kind: "boot",
          name: "ChunkLoadError",
          message: "failed to load https://app.test/_next/static/a.js for +998***",
          source: "https://app.test/_next/static/a.js:3:4",
          stage: "boot",
          screen: "search/list",
          tg: "7.10",
          platform: "android",
        },
      },
    });
    expect(logs).toEqual([]);
  });

  it("without the cookie: no request, one log line with v, name, tg and platform only", async () => {
    const response = await post(JSON.stringify(ENTRY));

    expect(response.status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
    const line = String(logs[0]?.[0]);
    expect(JSON.parse(line)).toEqual({ event: "boot_error", v: "2026.11.21", name: "ChunkLoadError", tg: "7.10", platform: "android" });
    expect(line).not.toMatch(/failed to load|_next|https?:|998|tgWebAppData/);
  });

  it("over 2 KB, a foreign origin, another content type or broken JSON: 204 and nothing forwarded or logged", async () => {
    const big = JSON.stringify({ error: { message: "m".repeat(3000) } });
    for (const response of [
      await post(big, { cookie: "homi_session=t" }),
      await post(JSON.stringify(ENTRY), { cookie: "homi_session=t", origin: "https://evil.test" }),
      await post(JSON.stringify(ENTRY), { cookie: "homi_session=t", "content-type": "text/plain" }),
      await post("{not json", { cookie: "homi_session=t" }),
    ]) {
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("answers 204 when the API fails", async () => {
    fetch.mockRejectedValueOnce(new TypeError("down"));

    expect((await post(JSON.stringify(ENTRY), { cookie: "homi_session=t" })).status).toBe(204);
  });
});
