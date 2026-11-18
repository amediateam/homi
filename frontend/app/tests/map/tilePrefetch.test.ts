import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { writeFit } from "@/features/map/camera";
import {
  budgetFor,
  PREFETCH_BUDGET,
  prefetchTiles,
  type PrefetchOptions,
  prefetchTilesFor,
  resetPrefetchForTests,
  type TileFetcher,
} from "@/features/map/tilePrefetch";
import type { CityView } from "@/features/map/types";

const TEMPLATE = "https://tiles.homi.test/v4/{z}/{x}/{y}.mvt";
const TASHKENT: CityView = { center: [41.3111, 69.2797], zoom: 12 };
const PHONE = { width: 390, height: 600 };
/** Nine data tiles around Tashkent at the default view: more than either preload budget. */
const LARGE = { width: 1000, height: 1000 };
const KB = 1024;

/** A city `index` steps east of Tashkent, far enough that no tile is shared. */
function cityAt(index: number): CityView {
  return { center: [41.3111, 60 + index * 2], zoom: 12 };
}

/** A fetcher answering every tile with a body of `bytes`. */
function answering(bytes: number) {
  return vi.fn<TileFetcher>(async () => new Response(new Uint8Array(bytes)));
}

function urlsOf(fetcher: Mock<TileFetcher>): string[] {
  return fetcher.mock.calls.map(([url]) => url);
}

function options(overrides: Partial<PrefetchOptions>): PrefetchOptions {
  return { template: TEMPLATE, city: TASHKENT, viewport: PHONE, lite: false, network: {}, ...overrides };
}

beforeEach(() => {
  resetPrefetchForTests();
  window.localStorage.clear();
});

afterEach(() => {
  resetPrefetchForTests();
  window.localStorage.clear();
  Reflect.deleteProperty(navigator, "connection");
  vi.unstubAllGlobals();
});

describe("budgetFor (03 §3.4 tile prefetch budget)", () => {
  it("keeps the legacy table", () => {
    expect(PREFETCH_BUDGET).toEqual({
      off: { perStop: 0, preloadTiles: 0, preloadBytes: 0, sessionBytes: 0 },
      lite: { perStop: 2, preloadTiles: 3, preloadBytes: 300 * KB, sessionBytes: 1.5 * KB * KB },
      full: { perStop: 4, preloadTiles: 6, preloadBytes: 600 * KB, sessionBytes: 4 * KB * KB },
    });
  });

  it.each<[string, { saveData?: boolean; effectiveType?: string }, boolean, keyof typeof PREFETCH_BUDGET]>([
    ["Save-Data", { saveData: true, effectiveType: "4g" }, false, "off"],
    ["2g", { effectiveType: "2g" }, false, "off"],
    ["slow-2g in lite mode", { effectiveType: "slow-2g" }, true, "off"],
    ["3g", { effectiveType: "3g" }, false, "full"],
    ["4g in lite mode", { effectiveType: "4g" }, true, "lite"],
    ["an unknown network", {}, false, "full"],
  ])("%s → %s", (_, network, lite, mode) => {
    expect(budgetFor(network, lite)).toEqual(PREFETCH_BUDGET[mode]);
  });
});

describe("prefetchTilesFor (KV-FE-062)", () => {
  it("covers half a screen each way from the centre with 512-px tiles at zoom − 1, nearest first", () => {
    expect(prefetchTilesFor({ center: TASHKENT.center, zoom: 11 }, PHONE)).toEqual([
      { z: 10, x: 709, y: 382 },
      { z: 10, x: 708, y: 382 },
      { z: 10, x: 709, y: 383 },
      { z: 10, x: 708, y: 383 },
    ]);
  });

  it("takes whole data zooms and stops at 15", () => {
    const view = { center: TASHKENT.center, zoom: 11 };

    expect(prefetchTilesFor(view, PHONE, 12.6)[0]).toEqual({ z: 11, x: 1418, y: 765 });
    expect(prefetchTilesFor(view, PHONE, 18).every((tile) => tile.z === 15)).toBe(true);
    expect(prefetchTilesFor(view, PHONE, 0.5)).toEqual([{ z: 0, x: 0, y: 0 }]);
  });
});

describe("prefetchTiles (KV-FE-062)", () => {
  it("fetches the tiles of the city centre at zoom − 1 in order, at low priority", async () => {
    const fetcher = answering(10 * KB);
    const controller = new AbortController();

    await expect(prefetchTiles(options({ fetcher, signal: controller.signal }))).resolves.toEqual({ tiles: 4, bytes: 40 * KB });
    expect(urlsOf(fetcher)).toEqual([
      "https://tiles.homi.test/v4/10/709/382.mvt",
      "https://tiles.homi.test/v4/10/708/382.mvt",
      "https://tiles.homi.test/v4/10/709/383.mvt",
      "https://tiles.homi.test/v4/10/708/383.mvt",
    ]);
    expect(fetcher.mock.calls[0][1]).toEqual({ signal: controller.signal, priority: "low" });
  });

  it("starts from the saved fit of the city when there is one", async () => {
    writeFit(TASHKENT.center, { center: [41.33, 69.3], zoom: 14 });
    const fetcher = answering(10 * KB);

    await prefetchTiles(options({ fetcher, viewport: { width: 390, height: 500 } }));

    expect(urlsOf(fetcher)).toEqual([
      "https://tiles.homi.test/v4/13/5672/3061.mvt",
      "https://tiles.homi.test/v4/13/5673/3061.mvt",
      "https://tiles.homi.test/v4/13/5672/3060.mvt",
      "https://tiles.homi.test/v4/13/5673/3060.mvt",
    ]);
  });

  it("runs once per template and city centre in a launch, and never asks for a tile twice", async () => {
    const fetcher = answering(10 * KB);

    await prefetchTiles(options({ fetcher }));
    await prefetchTiles(options({ fetcher }));
    expect(fetcher).toHaveBeenCalledTimes(4);

    await prefetchTiles(options({ fetcher, city: { center: [41.3112, 69.2797], zoom: 12 } }));
    expect(fetcher).toHaveBeenCalledTimes(4);

    await prefetchTiles(options({ fetcher, template: "https://tiles2.homi.test/{z}/{x}/{y}.mvt" }));
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it.each<[boolean, number]>([
    [true, 3],
    [false, 6],
  ])("stops at the preload tile count (lite %s → %i)", async (lite, count) => {
    const fetcher = answering(10 * KB);

    await prefetchTiles(options({ fetcher, viewport: LARGE, lite }));

    expect(fetcher).toHaveBeenCalledTimes(count);
    expect(prefetchTilesFor({ center: TASHKENT.center, zoom: 11 }, LARGE)).toHaveLength(9);
  });

  it.each<[boolean, number, number]>([
    [true, 200, 2],
    [false, 400, 2],
    [false, 100, 6],
  ])("counts the bytes of the responses against the preload cap (lite %s, %i KB tiles → %i)", async (lite, size, count) => {
    const fetcher = answering(size * KB);

    await expect(prefetchTiles(options({ fetcher, viewport: LARGE, lite }))).resolves.toEqual({ tiles: count, bytes: count * size * KB });
    expect(fetcher).toHaveBeenCalledTimes(count);
  });

  it("stops at the bytes of the launch", async () => {
    const fetcher = answering(400 * KB);
    const tilesPerCity: number[] = [];

    for (let index = 0; index < 7; index += 1) {
      const before = fetcher.mock.calls.length;
      await prefetchTiles(options({ fetcher, viewport: LARGE, city: cityAt(index) }));
      tilesPerCity.push(fetcher.mock.calls.length - before);
    }

    expect(tilesPerCity).toEqual([2, 2, 2, 2, 2, 1, 0]);
    expect(fetcher.mock.calls.length * 400 * KB).toBeGreaterThanOrEqual(PREFETCH_BUDGET.full.sessionBytes);
  });

  it("fetches nothing with Save-Data or on 2g, and runs later on a better network", async () => {
    const fetcher = answering(10 * KB);

    await prefetchTiles(options({ fetcher, network: { saveData: true } }));
    await prefetchTiles(options({ fetcher, network: { effectiveType: "2g" } }));
    expect(fetcher).not.toHaveBeenCalled();

    await prefetchTiles(options({ fetcher, network: { effectiveType: "4g" } }));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("reads navigator.connection when no network is given", async () => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" }, configurable: true });
    const fetcher = answering(10 * KB);

    await prefetchTiles({ template: TEMPLATE, city: TASHKENT, viewport: PHONE, lite: false, fetcher });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["no reference data", undefined],
    ["the raster fallback", null],
    ["an empty address", ""],
    ["a PMTiles file", "https://media.homi.test/basemap/v4.pmtiles"],
    ["OpenStreetMap's tiles", "https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    ["OpenStreetMap's subdomain tiles", "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
  ])("asks for nothing with %s", async (_, template) => {
    const fetcher = answering(10 * KB);

    await expect(prefetchTiles(options({ fetcher, template }))).resolves.toEqual({ tiles: 0, bytes: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks for nothing without a city", async () => {
    const fetcher = answering(10 * KB);

    await prefetchTiles(options({ fetcher, city: null }));

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips a failed tile silently and asks for it again in a later prefetch", async () => {
    let calls = 0;
    const fetcher = vi.fn<TileFetcher>(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(new Uint8Array(10 * KB));
    });

    await expect(prefetchTiles(options({ fetcher }))).resolves.toEqual({ tiles: 3, bytes: 30 * KB });
    await prefetchTiles(options({ fetcher, city: { center: [41.3112, 69.2797], zoom: 12 } }));

    expect(urlsOf(fetcher)).toHaveLength(5);
    expect(urlsOf(fetcher).slice(4)).toEqual(["https://tiles.homi.test/v4/10/709/382.mvt"]);
  });

  it("stops on abort and leaves the rest of the region to a later prefetch", async () => {
    const controller = new AbortController();
    let calls = 0;
    const fetcher = vi.fn<TileFetcher>((_, init) => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(new Response(new Uint8Array(10 * KB)));
      }
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });

    const pending = prefetchTiles(options({ fetcher, signal: controller.signal }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    controller.abort();

    await expect(pending).resolves.toEqual({ tiles: 1, bytes: 10 * KB });
    expect(fetcher).toHaveBeenCalledTimes(2);

    const later = answering(10 * KB);
    await prefetchTiles(options({ fetcher: later }));
    expect(urlsOf(later)).toEqual([
      "https://tiles.homi.test/v4/10/708/382.mvt",
      "https://tiles.homi.test/v4/10/709/383.mvt",
      "https://tiles.homi.test/v4/10/708/383.mvt",
    ]);
  });

  it("does nothing for an already aborted signal", async () => {
    const fetcher = answering(10 * KB);

    await prefetchTiles(options({ fetcher, signal: AbortSignal.abort() }));

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses fetch when no fetcher is given", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(KB)));
    vi.stubGlobal("fetch", fetch);

    await prefetchTiles(options({ viewport: { width: 1, height: 1 } }));

    expect(fetch).toHaveBeenCalledWith("https://tiles.homi.test/v4/10/709/382.mvt", { signal: undefined, priority: "low" });
  });
});
