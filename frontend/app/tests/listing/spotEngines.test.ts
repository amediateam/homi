import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapFailReason } from "@/features/map/types";

/** A recorded call of a fake library: what was made, with which options. */
type Made = { kind: string; args: unknown[]; addTo: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

const state = vi.hoisted(() => ({
  /** The next `new maplibre.Map()` throws this. */
  glThrow: null as Error | null,
  glMaps: [] as {
    options: Record<string, unknown>;
    handlers: Map<string, (event: unknown) => void>;
    setStyle: ReturnType<typeof vi.fn>;
    fitBounds: ReturnType<typeof vi.fn>;
    disableRotation: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  }[],
  made: [] as Made[],
  leafletMaps: [] as {
    element: HTMLElement;
    options: Record<string, unknown>;
    fitBounds: ReturnType<typeof vi.fn>;
    flyToBounds: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  }[],
}));

vi.mock("@/features/map/gl/library", () => {
  class GPUInitializationError extends Error {}
  class FakeMap {
    constructor(options: Record<string, unknown>) {
      if (state.glThrow !== null) {
        throw state.glThrow;
      }
      const handlers = new Map<string, (event: unknown) => void>();
      const record = {
        options,
        handlers,
        setStyle: vi.fn(),
        fitBounds: vi.fn(),
        disableRotation: vi.fn(),
        remove: vi.fn(),
      };
      state.glMaps.push(record);
      return {
        on: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
        off: (type: string) => handlers.delete(type),
        setStyle: record.setStyle,
        fitBounds: record.fitBounds,
        touchZoomRotate: { disableRotation: record.disableRotation },
        remove: record.remove,
      };
    }
  }
  return { loadMapLibre: () => Promise.resolve({ Map: FakeMap, GPUInitializationError }) };
});

vi.mock("@/features/map/leaflet/library", async (importOriginal) => {
  // The real removal: on these fakes it clears the zoom flags, then calls `off` and `remove`.
  const { removeLeafletMap } = await importOriginal<typeof import("@/features/map/leaflet/library")>();
  const layer = (kind: string) =>
    (...args: unknown[]) => {
      const made: Made = { kind, args, addTo: vi.fn(), remove: vi.fn() };
      made.addTo.mockReturnValue(made);
      state.made.push(made);
      return made;
    };
  const L = {
    map: (element: HTMLElement, options: Record<string, unknown>) => {
      const map = { element, options, fitBounds: vi.fn(), flyToBounds: vi.fn(), off: vi.fn(), remove: vi.fn() };
      state.leafletMaps.push(map);
      return map;
    },
    latLngBounds: (southWest: unknown, northEast: unknown) => ({ southWest, northEast }),
    circle: layer("circle"),
    circleMarker: layer("circleMarker"),
    tileLayer: layer("tileLayer"),
  };
  return { loadLeaflet: () => Promise.resolve({ L, protomaps: {} }), removeLeafletMap };
});

/** The search map's vector layer is tested with the Leaflet view; here only its input counts. */
vi.mock("@/features/map/leaflet/basemap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/map/leaflet/basemap")>()),
  vectorLayer: (_library: unknown, options: unknown) => {
    const made: Made = { kind: "vector", args: [options], addTo: vi.fn(), remove: vi.fn() };
    made.addTo.mockReturnValue(made);
    state.made.push(made);
    return made;
  },
}));

import { loadSpotEngine as loadGl, spotStyle } from "@/features/listing/spot/spotGL";
import type { Spot } from "@/features/listing/spot/spotGeometry";
import { loadSpotEngine as loadLeaflet } from "@/features/listing/spot/spotLeaflet";
import type { SpotInput } from "@/features/listing/spot/useSpotMap";
import { BASEMAP_SOURCE, ME_ACCURACY_LAYER, ME_DOT_LAYER, ME_SOURCE, OSM_LAYER } from "@/features/map/gl/style";
import { paletteOf } from "@/features/map/palette";

const SPOT: Spot = { lat: 41.36512, lon: 69.28431, radius: 500 };

function input(overrides: Partial<SpotInput> = {}): SpotInput {
  return {
    spot: SPOT,
    basemap: { kind: "raster" },
    interactive: false,
    scheme: "light",
    locale: "ru",
    lite: false,
    user: null,
    onVectorError: vi.fn(),
    ...overrides,
  };
}

/** A container of `width` × `height` px (jsdom lays nothing out). */
function sized(width: number, height: number): HTMLDivElement {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientWidth", { value: width });
  Object.defineProperty(div, "clientHeight", { value: height });
  return div;
}

let element: HTMLDivElement;
let onFail: ReturnType<typeof vi.fn<(reason: MapFailReason) => void>>;

beforeEach(() => {
  state.glThrow = null;
  state.glMaps = [];
  state.made = [];
  state.leafletMaps = [];
  element = sized(390, 800);
  onFail = vi.fn<(reason: MapFailReason) => void>();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("spotStyle (GL)", () => {
  it("is the search map's style with the circle — fill 0.12, the theme's outline — under the user's dot", () => {
    for (const scheme of ["light", "dark"] as const) {
      const style = spotStyle(input({ scheme }), { lat: 41.3, lon: 69.2 });
      const ids = style.layers.map((layer) => layer.id);
      const { outline } = paletteOf(scheme).mask;

      expect(ids.indexOf(OSM_LAYER)).toBeLessThan(ids.indexOf("spot-fill"));
      expect(ids.indexOf("spot-line")).toBeLessThan(ids.indexOf(ME_DOT_LAYER));
      expect(style.layers.find((layer) => layer.id === "spot-fill")).toMatchObject({
        type: "fill",
        paint: { "fill-color": outline, "fill-opacity": 0.12 },
      });
      expect(style.layers.find((layer) => layer.id === "spot-line")).toMatchObject({ type: "line", paint: { "line-color": outline } });
      expect(ids.indexOf("spot-line")).toBeLessThan(ids.indexOf(ME_ACCURACY_LAYER));
      // The dot alone: the search map's accuracy circle has no polygon to draw.
      expect(style.sources[ME_SOURCE]).toMatchObject({ data: { features: [{ geometry: { type: "Point", coordinates: [69.2, 41.3] } }] } });
      expect(style.sources.spot).toMatchObject({ type: "geojson", data: { geometry: { type: "Polygon" } } });
    }
  });

  it("has no dot without a user and keeps the circle last", () => {
    const ids = spotStyle(input(), null).layers.map((layer) => layer.id);

    expect(ids.slice(-2)).toEqual(["spot-fill", "spot-line"]);
    expect(ids).not.toContain(ME_DOT_LAYER);
  });
});

describe("spotGL engine", () => {
  it("makes a static map of the spot's box for the mini map, without rotation, attribution or world copies", async () => {
    const engine = await loadGl();
    const instance = engine.create(element, input(), onFail);

    expect(instance).not.toBeNull();
    const [map] = state.glMaps;
    expect(map.options).toMatchObject({
      container: element,
      // Under the fit: the spot at the zoom of its radius (Yandex's 16 on the Leaflet scale).
      center: [SPOT.lon, SPOT.lat],
      zoom: 15,
      interactive: false,
      attributionControl: false,
      renderWorldCopies: false,
      dragRotate: false,
      fitBoundsOptions: { padding: { top: 16, bottom: 16, left: 16, right: 16 }, maxZoom: 16 },
    });
    expect(map.disableRotation).not.toHaveBeenCalled();
  });

  it("makes the fullscreen map interactive, rotation off, padded for its card", async () => {
    const engine = await loadGl();
    engine.create(element, input({ interactive: true }), onFail);

    expect(state.glMaps[0].options).toMatchObject({ interactive: true, fitBoundsOptions: { padding: { top: 90, bottom: 240 } } });
    expect(state.glMaps[0].disableRotation).toHaveBeenCalledOnce();
  });

  it("shrinks the padding of a short map so the fit has room, also for a later fit", async () => {
    const engine = await loadGl();
    const instance = engine.create(sized(390, 300), input({ interactive: true }), onFail)!;
    instance.fit(null);

    const first = (state.glMaps[0].options.fitBoundsOptions as { padding: { top: number; bottom: number } }).padding;
    const later = (state.glMaps[0].fitBounds.mock.calls[0][1] as { padding: { top: number; bottom: number } }).padding;
    for (const padding of [first, later]) {
      expect(padding.top + padding.bottom).toBeCloseTo(150);
    }
  });

  it("reports a map that cannot be made, by its reason, and answers null", async () => {
    const engine = await loadGl();
    const { GPUInitializationError } = (await import("@/features/map/gl/library").then((module) => module.loadMapLibre())) as unknown as {
      GPUInitializationError: new () => Error;
    };

    state.glThrow = new GPUInitializationError();
    expect(engine.create(element, input(), onFail)).toBeNull();
    state.glThrow = new Error("bad style");
    expect(engine.create(element, input(), onFail)).toBeNull();

    expect(onFail.mock.calls).toEqual([["webgl"], ["style"]]);
  });

  it("reports a lost context or a worker failure later, and a vector source error as such", async () => {
    const engine = await loadGl();
    const { GPUInitializationError } = (await import("@/features/map/gl/library").then((module) => module.loadMapLibre())) as unknown as {
      GPUInitializationError: new () => Error;
    };
    const props = input({ basemap: { kind: "pmtiles", url: "https://cdn.homi.loc/t.pmtiles" } });
    engine.create(element, props, onFail);
    const error = state.glMaps[0].handlers.get("error")!;

    error({ error: new GPUInitializationError() });
    error({ error: new Error("Worker failed to load: x") });
    error({ error: new Error("404"), sourceId: BASEMAP_SOURCE });

    expect(onFail.mock.calls).toEqual([["webgl"], ["chunk"]]);
    expect(props.onVectorError).toHaveBeenCalledOnce();
  });

  it("draws the user with a style diff, fits spot and user, and removes the map", async () => {
    const engine = await loadGl();
    const instance = engine.create(element, input(), onFail)!;
    const [map] = state.glMaps;

    instance.showUser({ lat: 41.3, lon: 69.2 });
    instance.fit({ lat: 41.3, lon: 69.2 });
    instance.remove();

    expect(map.setStyle).toHaveBeenCalledWith(expect.objectContaining({ version: 8 }), { diff: true });
    // The user is south-west of the circle: the box runs from the user to the circle's north-east edge.
    const [bounds, options] = map.fitBounds.mock.calls[0] as [[number, number][], Record<string, unknown>];
    expect(bounds[0]).toEqual([69.2, 41.3]);
    expect(bounds[1][0]).toBeCloseTo(SPOT.lon + 0.006, 3);
    expect(bounds[1][1]).toBeCloseTo(SPOT.lat + 0.0045, 3);
    expect(options).toMatchObject({ duration: 600, maxZoom: 16 });
    expect(map.remove).toHaveBeenCalledOnce();
    expect(map.handlers.has("error")).toBe(false);
  });
});

describe("spotLeaflet engine", () => {
  const made = (kind: string) => state.made.filter((item) => item.kind === kind);

  it("makes a mini map that ignores pan and zoom, with no controls, fitted at once to the spot", async () => {
    const engine = await loadLeaflet();
    engine.create(element, input(), onFail);

    const [map] = state.leafletMaps;
    expect(map.element).toBe(element);
    expect(map.options).toEqual({
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
      keyboard: false,
      worldCopyJump: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
    });
    expect(map.fitBounds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ animate: false, maxZoom: 17 }));
  });

  it("makes the fullscreen map pan and zoom, fitted with the card's padding, shrunk on a short map", async () => {
    const engine = await loadLeaflet();
    engine.create(element, input({ interactive: true }), onFail);
    engine.create(sized(390, 300), input({ interactive: true }), onFail);

    expect(state.leafletMaps[0].options).toMatchObject({ dragging: true, touchZoom: true, doubleClickZoom: true, scrollWheelZoom: true });
    expect(state.leafletMaps[0].fitBounds.mock.calls[0][1]).toMatchObject({ paddingTopLeft: [32, 90], paddingBottomRight: [32, 240] });
    const short = state.leafletMaps[1].fitBounds.mock.calls[0][1] as { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] };
    expect(short.paddingTopLeft[1] + short.paddingBottomRight[1]).toBeCloseTo(150);
  });

  it("draws the raster and the circle — fill 0.12, the theme's outline — never as a tap target", async () => {
    const engine = await loadLeaflet();
    engine.create(element, input({ scheme: "dark" }), onFail);

    expect(made("tileLayer")).toHaveLength(1);
    const [circle] = made("circle");
    const { outline } = paletteOf("dark").mask;
    expect(circle.args).toEqual([
      [SPOT.lat, SPOT.lon],
      { radius: 500, color: outline, weight: 2, fillColor: outline, fillOpacity: 0.12, interactive: false },
    ]);
    expect(circle.addTo).toHaveBeenCalledOnce();
  });

  it("draws no basemap without reference data and the vector layer for a pmtiles file", async () => {
    const engine = await loadLeaflet();
    engine.create(element, input({ basemap: { kind: "none" } }), onFail);
    expect(made("tileLayer")).toHaveLength(0);
    expect(made("vector")).toHaveLength(0);

    const props = input({ basemap: { kind: "pmtiles", url: "https://cdn.homi.loc/t.pmtiles" }, scheme: "dark", locale: "uz", lite: true });
    engine.create(element, props, onFail);
    expect(made("vector")).toHaveLength(1);
    expect(made("vector")[0].args[0]).toEqual({
      url: "https://cdn.homi.loc/t.pmtiles",
      scheme: "dark",
      lite: true,
      locale: "uz",
      onError: props.onVectorError,
    });
    expect(made("vector")[0].addTo).toHaveBeenCalledOnce();
  });

  it("shows, replaces and removes the user's dot, flies to spot and user, and removes the map", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const engine = await loadLeaflet();
    const instance = engine.create(element, input(), onFail)!;
    const [map] = state.leafletMaps;

    instance.showUser({ lat: 41.3, lon: 69.2 });
    instance.showUser({ lat: 41.31, lon: 69.21 });
    instance.showUser(null);
    instance.fit({ lat: 41.3, lon: 69.2 });
    instance.remove();

    const dots = made("circleMarker");
    expect(dots.map((dot) => dot.args[0])).toEqual([
      [41.3, 69.2],
      [41.31, 69.21],
    ]);
    expect(dots.every((dot) => dot.remove.mock.calls.length === 1)).toBe(true);
    expect(dots[0].args[1]).toMatchObject({ radius: 7, fillColor: paletteOf("light").me.dot, interactive: false });
    expect(map.flyToBounds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 0.6 }));
    expect(map.off).toHaveBeenCalledOnce();
    expect(map.remove).toHaveBeenCalledOnce();
  });

  it("jumps instead of flying under reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const engine = await loadLeaflet();
    const instance = engine.create(element, input(), onFail)!;

    instance.fit(null);

    expect(state.leafletMaps[0].flyToBounds).not.toHaveBeenCalled();
    expect(state.leafletMaps[0].fitBounds).toHaveBeenCalledTimes(2);
  });
});
