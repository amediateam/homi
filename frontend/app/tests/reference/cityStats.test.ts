// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ life: [] as unknown[] }));
vi.mock("next/cache", () => ({
  cacheLife: (profile: unknown) => void cache.life.push(profile),
  cacheTag: () => undefined,
  io: async () => undefined,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { cityStatsOf, isCityStats } = await import("@/lib/reference/cityStats");
const { REFERENCE_LIFE, getCities } = await import("@/lib/reference/server");

const TASHKENT = { code: "tashkent", counts: { rent_long: 1, rent_daily: 0, sale: 2 }, price_presets: {}, typical_price: {} };
const MALFORMED: unknown[] = [null, undefined, 1, "tashkent", [], { counts: {} }, { code: 7 }, { code: null }];

function answer(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body)),
  );
}

beforeEach(() => {
  cache.life = [];
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
});

describe("isCityStats / cityStatsOf (WP-25 security review, S-2)", () => {
  it("an element is usable only as an object with a string code", () => {
    expect(isCityStats(TASHKENT)).toBe(true);
    expect(isCityStats({ code: "andijan" })).toBe(true);
    for (const value of MALFORMED) {
      expect(isCityStats(value)).toBe(false);
    }
  });

  it("keeps the usable elements of a list, and refuses what is not a list", () => {
    expect(cityStatsOf([...MALFORMED, TASHKENT])).toEqual([TASHKENT]);
    expect(cityStatsOf([])).toEqual([]);
    for (const value of [null, undefined, {}, { data: [TASHKENT] }, "[]"]) {
      expect(cityStatsOf(value)).toBeNull();
    }
  });
});

describe("getCities with a malformed answer", () => {
  it("keeps only the elements with a code, for the usual lifetime", async () => {
    answer({ success: true, data: [null, { counts: {} }, TASHKENT, 1], meta: { source: "stub" } });

    await expect(getCities("ru")).resolves.toEqual({ loaded: true, data: [TASHKENT], source: "stub" });
    expect(cache.life).toEqual([REFERENCE_LIFE]);
  });

  it("an answer that is not a list is a failed read with a short lifetime", async () => {
    answer({ success: true, data: { tashkent: TASHKENT }, meta: { source: "stub" } });

    await expect(getCities("ru")).resolves.toEqual({ loaded: false, data: [] });
    expect(cache.life).toEqual(["seconds"]);
  });
});
