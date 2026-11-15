// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ life: [] as unknown[], tags: [] as string[] }));
vi.mock("next/cache", () => ({
  cacheLife: (profile: unknown) => void cache.life.push(profile),
  cacheTag: (...tags: string[]) => void cache.tags.push(...tags),
  io: async () => undefined,
}));
const jar = new Map([
  ["homi_session", "cookie-token"],
  ["homi_stub_scenario", "empty_feed"],
]);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => ({ name, value: jar.get(name) }) }) }));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { EMPTY_REFERENCE, REFERENCE_LIFE, getCities, getReference } = await import("@/lib/reference/server");

type Sent = { url: string; headers: Record<string, string> };
let sent: Sent[] = [];

function answer(response: () => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), headers: init.headers as Record<string, string> });
      return response();
    }),
  );
}

beforeEach(() => {
  sent = [];
  cache.life = [];
  cache.tags = [];
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
});

describe("getReference / getCities (WP-22)", () => {
  it("reads the public method without a user token or a stub scenario, tagged reference, for about ten minutes", async () => {
    const data = { ...EMPTY_REFERENCE, radars_enabled: true };
    answer(() => Response.json({ success: true, data, meta: { source: "stub" } }));

    await expect(getReference("uz")).resolves.toEqual({ loaded: true, data, source: "stub" });

    expect(sent[0].url).toBe("https://api.test/api/v1/reference");
    expect(sent[0].headers.Authorization).toBeUndefined();
    expect(sent[0].headers["X-Stub-Scenario"]).toBeUndefined();
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
    expect(cache.tags).toEqual(["reference"]);
    expect(cache.life).toEqual([REFERENCE_LIFE]);
    expect(REFERENCE_LIFE).toMatchObject({ revalidate: 600 });
  });

  it("never throws: a failed or unreachable call is the empty reference with a short lifetime", async () => {
    answer(() => Promise.reject(new TypeError("connect ECONNREFUSED")));
    await expect(getReference("ru")).resolves.toEqual({ loaded: false, data: EMPTY_REFERENCE });

    answer(() => Response.json({ success: false, message: "x", code: "source_unavailable" }, { status: 503 }));
    await expect(getCities("ru")).resolves.toEqual({ loaded: false, data: [] });

    expect(cache.life).toEqual(["seconds", "seconds"]);
  });

  it("the empty reference offers no radar, no city and the default radar limit", () => {
    expect(EMPTY_REFERENCE).toMatchObject({ radars_enabled: false, cities: [], limits: { radars: 10 }, bot: { username: null, support_username: null } });
  });

  it("getCities reads /cities", async () => {
    const stats = [{ code: "tashkent", counts: { rent_long: 1, rent_daily: 0, sale: 2 }, price_presets: {}, typical_price: {} }];
    answer(() => Response.json({ success: true, data: stats, meta: { source: "legacy" } }));

    await expect(getCities("en")).resolves.toEqual({ loaded: true, data: stats, source: "legacy" });
    expect(sent[0].url).toBe("https://api.test/api/v1/cities");
  });
});
