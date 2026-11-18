import type { Locale } from "@homi/config";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { LayerGroup, Map as LMap } from "leaflet";
import type { LeafletLayerOptions } from "protomaps-leaflet";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useBasemap as useGlBasemap } from "@/features/map/gl/useMapInstance";
import {
  attachTilePrefetch,
  RASTER_CLASS,
  RASTER_MAX_ZOOM,
  resetMapPrefetchForTests,
  ringTiles,
  watchVectorErrors,
} from "@/features/map/leaflet/basemap";
import { basemapRules, labelProps } from "@/features/map/leaflet/basemapRules";
import { type LeafletLibrary, loadLeaflet } from "@/features/map/leaflet/library";
import { BASEMAP_DELAY_MS, type DeferredBasemapInput, useDeferredBasemap } from "@/features/map/leaflet/useDeferredBasemap";
import { LEAFLET_MAX_ZOOM, type LeafletHandle } from "@/features/map/leaflet/useLeafletMap";
import { paletteOf } from "@/features/map/palette";
import { MAX_DATA_ZOOM, prefetchTilesFor, type TileFetcher } from "@/features/map/tilePrefetch";
import type { Basemap } from "@/features/map/tiles";
import type { CityView, MapScheme } from "@/features/map/types";
import { resetBasemapForTests } from "@/features/map/useBasemap";

const state = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/errors/report", () => ({ reportError: (...args: unknown[]) => state.reportError(...args) }));

const PMTILES = "https://tiles.homi.test/basemap.pmtiles?v=3";
const TEMPLATE = "https://tiles.homi.test/v4/{z}/{x}/{y}.mvt";

type FakeView = { getDisplayTile(tile: { z: number; x: number; y: number }): Promise<unknown> };
type FakeVector = LayerGroup & { views: Map<string, FakeView>; options: LeafletLayerOptions };

let library: LeafletLibrary;
let map: LMap | null = null;
let container: HTMLElement;
/** The map of the current test, once mounted. */
let live: LMap;
/** The vector layers `leafletLayer` made, newest last; each one's tile fails with `tileError`. */
let vectors: FakeVector[];
let tileError: Error;

beforeAll(async () => {
  library = await loadLeaflet();
});

beforeEach(() => {
  resetBasemapForTests();
  resetMapPrefetchForTests();
  state.reportError.mockReset();
  vectors = [];
  tileError = new Error("Bad response code: 404");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  map?.remove();
  map = null;
  container?.remove();
});

/** A real Leaflet map whose protomaps-leaflet module makes stand-in layers: jsdom has no canvas to draw tiles. */
function mount(): LeafletHandle {
  container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 400 });
  Object.defineProperty(container, "clientHeight", { value: 800 });
  document.body.append(container);
  map = library.L.map(container, { center: [41.3111, 69.2797], zoom: 12, maxZoom: LEAFLET_MAX_ZOOM, zoomControl: false, attributionControl: false });
  live = map;
  const protomaps = {
    ...library.protomaps,
    leafletLayer: (options: LeafletLayerOptions) => {
      const layer = Object.assign(library.L.layerGroup(), {
        options,
        views: new Map<string, FakeView>([["", { getDisplayTile: () => Promise.reject(tileError) }]]),
      }) as FakeVector;
      vectors.push(layer);
      return layer;
    },
  } as unknown as LeafletLibrary["protomaps"];
  return { mapRef: { current: { map: live, L: library.L, protomaps } }, generation: 1 };
}

type Props = Partial<DeferredBasemapInput> & { handle: LeafletHandle };

function render(props: Props) {
  const onBasemap = vi.fn<(basemap: Basemap) => void>();
  const initialProps: Props = { tiles: "", scheme: "light", lite: false, locale: "ru", fitted: false, onBasemap, ...props };
  const view = renderHook(
    ({ handle, tiles, scheme, lite, locale, fitted }: Props) =>
      useDeferredBasemap(handle, {
        tiles,
        scheme: scheme as MapScheme,
        lite: lite as boolean,
        locale: locale as Locale,
        fitted: fitted as boolean,
        onBasemap,
      }),
    { initialProps },
  );
  return { ...view, onBasemap, rerender: (next: Partial<Props>) => view.rerender({ ...initialProps, ...next }) };
}

const raster = () => container.querySelector(`.leaflet-layer.${RASTER_CLASS}`);

async function failTile(layer: FakeVector): Promise<void> {
  await act(async () => {
    await layer.views
      .get("")
      ?.getDisplayTile({ z: 12, x: 2834, y: 1530 })
      .catch(() => undefined);
  });
}

describe("useDeferredBasemap (WP-28 'Basemap')", () => {
  it("adds the basemap 1.2 s after the map was made when no fit came first", () => {
    vi.useFakeTimers();
    const handle = mount();
    render({ handle });

    act(() => {
      vi.advanceTimersByTime(BASEMAP_DELAY_MS - 1);
    });
    expect(raster()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(raster()).not.toBeNull();
  });

  it("adds the basemap at the first fit, before the 1.2 s", () => {
    vi.useFakeTimers();
    const handle = mount();
    const { rerender } = render({ handle });
    expect(raster()).toBeNull();

    rerender({ fitted: true });

    expect(raster()).not.toBeNull();
  });

  it("draws the OSM raster for empty tiles: zoom 19, origin referrer, no world copies", () => {
    const handle = mount();
    const { onBasemap } = render({ handle, tiles: null, fitted: true });

    let options: Record<string, unknown> = {};
    live.eachLayer((layer) => {
      options = layer.options as Record<string, unknown>;
    });
    expect(options).toMatchObject({ maxZoom: RASTER_MAX_ZOOM, referrerPolicy: "strict-origin-when-cross-origin", noWrap: true });
    expect(onBasemap).toHaveBeenLastCalledWith({ kind: "raster" });
  });

  it("adds nothing while reference data is absent: the land colour is the map", () => {
    vi.useFakeTimers();
    const handle = mount();
    const { onBasemap } = render({ handle, tiles: undefined, fitted: true });
    act(() => {
      vi.advanceTimersByTime(BASEMAP_DELAY_MS);
    });

    let layers = 0;
    live.eachLayer(() => {
      layers += 1;
    });
    expect(layers).toBe(0);
    expect(onBasemap).toHaveBeenLastCalledWith({ kind: "none" });
  });

  it("draws a .pmtiles file with protomaps-leaflet: the palette, data zoom 15, no HTML attribution, ratio 1 in lite", () => {
    const handle = mount();
    const { onBasemap } = render({ handle, tiles: PMTILES, lite: true, fitted: true });

    expect(vectors).toHaveLength(1);
    expect(live.hasLayer(vectors[0])).toBe(true);
    expect(vectors[0].options).toMatchObject({
      url: PMTILES,
      maxDataZoom: MAX_DATA_ZOOM,
      backgroundColor: paletteOf("light").land,
      devicePixelRatio: 1,
      noWrap: true,
      attribution: "",
    });
    expect(vectors[0].options.paintRules?.length).toBeGreaterThan(0);
    expect(raster()).toBeNull();
    expect(onBasemap).toHaveBeenLastCalledWith({ kind: "pmtiles", url: PMTILES });
  });

  it("makes the vector layer anew when the scheme, lite mode or locale changes", () => {
    const handle = mount();
    const { rerender } = render({ handle, tiles: PMTILES, fitted: true });

    rerender({ scheme: "dark" });
    rerender({ scheme: "dark", locale: "uz" });
    rerender({ scheme: "dark", locale: "uz", lite: true });

    expect(vectors).toHaveLength(4);
    expect(vectors.map((layer) => live.hasLayer(layer))).toEqual([false, false, false, true]);
    expect(vectors[1].options.backgroundColor).toBe(paletteOf("dark").land);
  });

  it("switches to the raster on a failing vector tile and reports map_tiles_failed once per session, with GL", async () => {
    const handle = mount();
    const { onBasemap, unmount } = render({ handle, tiles: PMTILES, fitted: true });

    await failTile(vectors[0]);

    expect(live.hasLayer(vectors[0])).toBe(false);
    expect(raster()).not.toBeNull();
    expect(onBasemap).toHaveBeenLastCalledWith({ kind: "raster" });
    expect(state.reportError).toHaveBeenCalledTimes(1);
    expect(state.reportError.mock.calls[0][0]).toEqual(new Error("map_tiles_failed"));
    // The session's rule is shared: a later map, on either engine, starts on the raster.
    expect(renderHook(() => useGlBasemap(PMTILES)).result.current.basemap).toEqual({ kind: "raster" });
    unmount();
    render({ handle, tiles: PMTILES, fitted: true });
    expect(vectors).toHaveLength(1);
    expect(raster()).not.toBeNull();

    // The old layer's late failures report nothing more, nor does another vector address failing later.
    await failTile(vectors[0]);
    const other = render({ handle, tiles: TEMPLATE, fitted: true });
    await failTile(vectors[1]);
    expect(other.onBasemap).toHaveBeenLastCalledWith({ kind: "raster" });
    expect(state.reportError).toHaveBeenCalledTimes(1);
  });

  it("keeps the vector layer when a tile is only aborted (a zoom cancels its tiles)", async () => {
    tileError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const handle = mount();
    render({ handle, tiles: TEMPLATE, fitted: true });

    await failTile(vectors[0]);

    expect(live.hasLayer(vectors[0])).toBe(true);
    expect(state.reportError).not.toHaveBeenCalled();
  });

  it("prefetches around a stopped view for a template only, not for a .pmtiles file or the raster", () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new ArrayBuffer(100)));
    vi.stubGlobal("fetch", fetch);
    const handle = mount();
    const { rerender } = render({ handle, tiles: PMTILES, fitted: true });

    live.fire("moveend");
    rerender({ tiles: "" });
    live.fire("moveend");
    expect(fetch).not.toHaveBeenCalled();

    // The view the template layer opens on is the first stop.
    rerender({ tiles: TEMPLATE });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/tiles\.homi\.test\/v4\/11\/\d+\/\d+\.mvt$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({ priority: "low" });
  });
});

describe("watchVectorErrors", () => {
  it("passes every tile through and reports a failure that is not an abort", async () => {
    const onError = vi.fn();
    const tile = { z: 1, x: 0, y: 0 };
    const views = new Map<string, FakeView>([
      ["ok", { getDisplayTile: async () => "tile" }],
      ["bad", { getDisplayTile: () => Promise.reject(new TypeError("Failed to fetch")) }],
    ]);
    watchVectorErrors({ views }, onError);

    await expect(views.get("ok")?.getDisplayTile(tile)).resolves.toBe("tile");
    expect(onError).not.toHaveBeenCalled();
    await expect(views.get("bad")?.getDisplayTile(tile)).rejects.toThrow("Failed to fetch");
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("basemapRules", () => {
  const dataLayers = (rules: { dataLayer: string }[]) => [...new Set(rules.map((rule) => rule.dataLayer))].sort();

  it("draws GL's layers, and in lite only land, water, roads, boundaries and town names", () => {
    const full = basemapRules(library.protomaps, paletteOf("light"), false, "ru");
    const lite = basemapRules(library.protomaps, paletteOf("light"), true, "ru");

    expect(dataLayers(full.paintRules)).toEqual(["boundaries", "buildings", "earth", "landcover", "landuse", "roads", "water"]);
    expect(dataLayers(lite.paintRules)).toEqual(["boundaries", "earth", "roads", "water"]);
    expect(full.labelRules).toHaveLength(4);
    expect(lite.labelRules).toHaveLength(1);
    expect(lite.labelRules[0].dataLayer).toBe("places");
  });

  it("labels in the interface locale with the default name as fallback; Uzbek reads the default name", () => {
    expect(labelProps("ru")).toEqual(["name:ru", "name"]);
    expect(labelProps("en")).toEqual(["name:en", "name"]);
    expect(labelProps("uz")).toEqual(["name"]);
  });
});

describe("attachTilePrefetch (WP-28, KV-FE-062 step 6)", () => {
  function fetcherOf(bytes: number) {
    return vi.fn<TileFetcher>(async () => new Response(new ArrayBuffer(bytes)));
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 20; round += 1) {
      await Promise.resolve();
    }
  }

  it("fetches at most 4 ring tiles per stop at low priority, nearest first, each once per launch", async () => {
    mount();
    const fetcher = fetcherOf(1000);
    // Attaching is the first stop.
    const stop = attachTilePrefetch(live, TEMPLATE, false, { network: () => ({}), fetcher });
    await settle();
    const view: CityView = { center: [41.3111, 69.2797], zoom: 12 };
    const ring = ringTiles(view, { width: 400, height: 800 }).map(({ z, x, y }) => `https://tiles.homi.test/v4/${z}/${x}/${y}.mvt`);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(ring.slice(0, 4));
    expect(fetcher.mock.calls[0][1]).toMatchObject({ priority: "low" });

    live.fire("moveend");
    await settle();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(ring.slice(0, 8));
    stop();
    live.fire("moveend");
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it("fetches 2 per stop in lite mode and nothing with Save-Data or on 2g", async () => {
    mount();
    const lite = fetcherOf(10);
    const saveData = fetcherOf(10);
    const slow = fetcherOf(10);
    attachTilePrefetch(live, TEMPLATE, true, { network: () => ({ effectiveType: "3g" }), fetcher: lite });
    attachTilePrefetch(live, TEMPLATE, false, { network: () => ({ saveData: true }), fetcher: saveData });
    attachTilePrefetch(live, TEMPLATE, false, { network: () => ({ effectiveType: "2g" }), fetcher: slow });
    await settle();

    expect(lite).toHaveBeenCalledTimes(2);
    expect(saveData).not.toHaveBeenCalled();
    expect(slow).not.toHaveBeenCalled();
  });

  it("stops at the session's byte cap: the tile that crosses it is the last", async () => {
    mount();
    const fetcher = fetcherOf(1.5 * 1024 * 1024);
    attachTilePrefetch(live, TEMPLATE, false, { network: () => ({}), fetcher });
    await settle();
    live.setView([41.4, 69.4], 13);
    await settle();

    // 4 MB per session: three tiles of 1.5 MB, the third crossing the cap.
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("never prefetches a .pmtiles file or OpenStreetMap's tiles", async () => {
    mount();
    const fetcher = fetcherOf(10);
    attachTilePrefetch(live, PMTILES, false, { network: () => ({}), fetcher });
    attachTilePrefetch(live, "https://tile.openstreetmap.org/{z}/{x}/{y}.png", false, { network: () => ({}), fetcher });

    live.fire("moveend");
    await settle();

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aborts what is left of a stop when the map stops again", async () => {
    mount();
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn<TileFetcher>((_url, init) => {
      signals.push(init.signal as AbortSignal);
      return new Promise(() => undefined);
    });
    attachTilePrefetch(live, TEMPLATE, false, { network: () => ({}), fetcher });

    live.fire("moveend");

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });
});

describe("ringTiles", () => {
  /** The shown tiles' box grown by one tile on each side, minus the shown tiles. */
  function expectFullRing(view: CityView, dataZoom: number): void {
    const viewport = { width: 400, height: 800 };
    const shown = prefetchTilesFor(view, viewport);
    const ring = ringTiles(view, viewport);
    const xs = shown.map((tile) => tile.x);
    const ys = shown.map((tile) => tile.y);
    const [west, east, north, south] = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1];
    const expected: string[] = [];
    for (let y = north; y <= south; y += 1) {
      for (let x = west; x <= east; x += 1) {
        if (!shown.some((tile) => tile.x === x && tile.y === y)) {
          expected.push(`${dataZoom}/${x}/${y}`);
        }
      }
    }

    expect(ring.map(({ z, x, y }) => `${z}/${x}/${y}`).sort()).toEqual(expected.sort());
  }

  it("is the ring one data tile wide around the tiles the view shows, at data zoom zoom − 1", () => {
    expectFullRing({ center: [41.3111, 69.2797], zoom: 12 }, 11);
  });

  it("reads data zoom 15 at most, as the layer's maxDataZoom, with tiles as large as they are drawn", () => {
    expectFullRing({ center: [41.3111, 69.2797], zoom: 18 }, 15);
  });
});
