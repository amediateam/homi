import { act, cleanup, render } from "@testing-library/react";
import type { StyleSpecification } from "maplibre-gl";
import { Activity, type ActivityProps, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLUSTER_PADDING, DEFAULT_CITY_VIEW, FIT_PADDING, GL_MAX_ZOOM, readFit, writeFit } from "@/features/map/camera";
import MapViewGL from "@/features/map/gl/MapViewGL";
import type { MapLibreModule } from "@/features/map/gl/library";
import { BASEMAP_SOURCE, MASK_SOURCE, ME_SOURCE, OSM_SOURCE } from "@/features/map/gl/style";
import { resetMapInstanceForTests } from "@/features/map/gl/useMapInstance";
import { spreadStackLabels } from "@/features/map/pins";
import { osmTransformRequest } from "@/features/map/tiles";
import type { Basemap } from "@/features/map/tiles";
import type { CityView, MapGroup, MapPoint, MapViewProps, MePosition } from "@/features/map/types";
import type { LaunchMapOptions } from "@/lib/deeplinks/launch";

const state = vi.hoisted(() => ({
  load: vi.fn<() => Promise<unknown>>(),
  options: { override: null, debug: false } as LaunchMapOptions,
  reportError: vi.fn(),
  impact: vi.fn(),
}));
vi.mock("@/features/map/gl/library", () => ({ loadMapLibre: () => state.load() }));
vi.mock("@/lib/deeplinks/launch", () => ({ launchMapOptions: () => state.options }));
vi.mock("@/lib/errors/report", () => ({ reportError: (...args: unknown[]) => state.reportError(...args) }));
vi.mock("@/lib/telegram", () => ({
  tg: { haptic: { impact: () => state.impact(), success: () => undefined, error: () => undefined } },
}));

type LngLatLiteral = { lng: number; lat: number };
type Box = [[west: number, south: number], [east: number, north: number]];
type Handler = (event: Record<string, unknown>) => void;
type Move = { kind: "jumpTo" | "easeTo" | "flyTo"; options: Record<string, unknown> };

class FakeLngLat {
  constructor(
    readonly lng: number,
    readonly lat: number,
  ) {}

  static convert(value: unknown): FakeLngLat {
    const { lng, lat } = toLngLat(value);
    return new FakeLngLat(lng, lat);
  }
}

function toLngLat(value: unknown): LngLatLiteral {
  if (Array.isArray(value)) {
    return { lng: value[0], lat: value[1] };
  }
  const { lng, lat } = value as LngLatLiteral;
  return { lng, lat };
}

class FakeGPUInitializationError extends Error {}

/** One of the map's gesture handlers (`dragPan`, `scrollZoom`, …): enabled until disabled. */
function gestureHandler() {
  let enabled = true;
  return {
    isEnabled: () => enabled,
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
    },
  };
}

/** The parts of MapLibre's `Map` the view uses, recording every call; moves fire `zoom` and `moveend` at once. */
class FakeMap {
  static created: FakeMap[] = [];
  static throwOnCreate: unknown = null;
  /** The visible box of the next map, `[[west, south], [east, north]]`. */
  static bounds: Box = [
    [-180, -85],
    [180, 85],
  ];

  readonly options: Record<string, unknown>;
  readonly styles: { style: StyleSpecification; options: unknown }[] = [];
  readonly moves: Move[] = [];
  readonly cameras: { bounds: Box; options: Record<string, unknown> }[] = [];
  readonly handlers = new Map<string, Set<Handler>>();
  readonly canvasContainer = document.createElement("div");
  readonly canvas = document.createElement("canvas");
  readonly dragPan = gestureHandler();
  readonly touchZoomRotate = { ...gestureHandler(), disableRotation: vi.fn() };
  readonly scrollZoom = gestureHandler();
  readonly doubleClickZoom = gestureHandler();
  readonly boxZoom = gestureHandler();
  removed = false;
  center: LngLatLiteral;
  zoom: number;
  pixelRatio: number;
  bounds: Box = FakeMap.bounds;
  /** The zoom `cameraForBounds` answers, capped at its `maxZoom`. */
  fitZoom = 12;

  constructor(options: Record<string, unknown>) {
    if (FakeMap.throwOnCreate !== null) {
      throw FakeMap.throwOnCreate;
    }
    this.options = options;
    this.center = toLngLat(options.center);
    this.zoom = options.zoom as number;
    this.pixelRatio = options.pixelRatio as number;
    this.canvasContainer.append(this.canvas);
    (options.container as HTMLElement).append(this.canvasContainer);
    FakeMap.created.push(this);
  }

  on(type: string, handler: Handler): this {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
    return this;
  }

  off(type: string, handler: Handler): this {
    this.handlers.get(type)?.delete(handler);
    return this;
  }

  fire(type: string, event: Record<string, unknown> = {}): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) {
      handler({ type, target: this, ...event });
    }
  }

  /** A DOM click that reached the map: on the canvas, or on an element inside a marker. */
  click(target: Element = this.canvas): void {
    this.fire("click", { originalEvent: { target } });
  }

  setStyle(style: StyleSpecification, options: unknown): this {
    this.styles.push({ style, options });
    return this;
  }

  getZoom(): number {
    return this.zoom;
  }

  getCenter(): LngLatLiteral {
    return this.center;
  }

  getBounds(): { toArray(): Box } {
    return { toArray: () => this.bounds };
  }

  getPixelRatio(): number {
    return this.pixelRatio;
  }

  setPixelRatio(value: number): void {
    this.pixelRatio = value;
  }

  getCanvasContainer(): HTMLElement {
    return this.canvasContainer;
  }

  cameraForBounds(bounds: Box, options: Record<string, unknown>) {
    this.cameras.push({ bounds, options });
    const [[west, south], [east, north]] = bounds;
    return { center: new FakeLngLat((west + east) / 2, (south + north) / 2), zoom: Math.min(this.fitZoom, options.maxZoom as number), bearing: 0 };
  }

  jumpTo(options: Record<string, unknown>): this {
    return this.move("jumpTo", options);
  }

  easeTo(options: Record<string, unknown>): this {
    return this.move("easeTo", options);
  }

  flyTo(options: Record<string, unknown>): this {
    return this.move("flyTo", options);
  }

  /** The user pans or zooms. */
  moveTo(center: LngLatLiteral, zoom: number): void {
    this.center = center;
    this.zoom = zoom;
    this.fire("zoom");
    this.fire("moveend");
  }

  remove(): void {
    this.removed = true;
    this.canvasContainer.remove();
  }

  private move(kind: Move["kind"], options: Record<string, unknown>): this {
    this.moves.push({ kind, options });
    this.moveTo(options.center === undefined ? this.center : toLngLat(options.center), (options.zoom as number | undefined) ?? this.zoom);
    return this;
  }
}

class FakeMarker {
  static all: FakeMarker[] = [];

  readonly element: HTMLElement;
  readonly anchor: unknown;
  offset: unknown;
  lngLat: unknown = null;

  constructor({ element, anchor, offset }: { element: HTMLElement; anchor?: string; offset?: unknown }) {
    this.element = element;
    this.anchor = anchor;
    this.offset = offset ?? [0, 0];
    element.classList.add("maplibregl-marker");
    FakeMarker.all.push(this);
  }

  setLngLat(lngLat: unknown): this {
    this.lngLat = lngLat;
    return this;
  }

  setOffset(offset: unknown): this {
    this.offset = offset;
    return this;
  }

  addTo(map: FakeMap): this {
    map.getCanvasContainer().append(this.element);
    return this;
  }

  remove(): this {
    this.element.remove();
    return this;
  }
}

const maplibre = {
  Map: FakeMap,
  Marker: FakeMarker,
  LngLat: FakeLngLat,
  GPUInitializationError: FakeGPUInitializationError,
} as unknown as MapLibreModule;

function point(number: number, overrides: Partial<MapPoint> = {}): MapPoint {
  return { number, origin: "legacy", lat: 41.3111, lon: 69.2797, label: `$${number}`, tone: null, priced: true, usd: number, ...overrides };
}

function group(lat: number, lon: number, ...items: MapPoint[]): MapGroup {
  return { key: `${lat.toFixed(5)},${lon.toFixed(5)}`, lat, lon, items: items.map((item) => ({ ...item, lat, lon })) };
}

/** Three pins and a stack of three around Tashkent's centre, far enough apart not to cluster at GL zoom 11. */
const PIN_A = group(41.3, 69.2, point(1));
const PIN_B = group(41.35, 69.3, point(2));
const PIN_C = group(41.25, 69.25, point(3));
const STACK = group(41.32, 69.35, point(11, { usd: 300, label: "$300" }), point(12, { usd: 600 }), point(13, { usd: 900 }));
const GROUPS = [PIN_A, PIN_B, PIN_C, STACK];

function viewProps(overrides: Partial<MapViewProps> = {}): MapViewProps {
  return {
    groups: [],
    responseId: 0,
    selection: null,
    onSelect: vi.fn(),
    onBackground: vi.fn(),
    polygon: null,
    cityView: DEFAULT_CITY_VIEW,
    cityKnown: true,
    tiles: null,
    locale: "ru",
    scheme: "light",
    lite: false,
    me: null,
    drawing: false,
    onFail: vi.fn(),
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function mount(overrides: Partial<MapViewProps> = {}) {
  let props = viewProps(overrides);
  const view = render(<MapViewGL {...props} />);
  await flush();
  return {
    ...view,
    props: () => props,
    map: FakeMap.created.at(-1)!,
    update: async (next: Partial<MapViewProps>) => {
      props = { ...props, ...next };
      view.rerender(<MapViewGL {...props} />);
      await flush();
    },
  };
}

function markers(root: ParentNode, kind: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-marker="${kind}"]`)];
}

function numbersOf(elements: HTMLElement[]): string[] {
  return elements.map((element) => element.dataset.number!).sort();
}

function pinOf(root: ParentNode, number: number): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-number="${number}"]`)!;
}

function markerOf(element: HTMLElement): FakeMarker {
  return FakeMarker.all.find((marker) => marker.element === element)!;
}

beforeEach(() => {
  resetMapInstanceForTests();
  window.localStorage.clear();
  FakeMap.created = [];
  FakeMap.throwOnCreate = null;
  FakeMap.bounds = [
    [-180, -85],
    [180, 85],
  ];
  FakeMarker.all = [];
  state.options = { override: null, debug: false };
  state.load.mockReset();
  state.load.mockResolvedValue(maplibre);
  state.reportError.mockReset();
  state.impact.mockReset();
});

afterEach(() => {
  cleanup();
  delete (window as Window & { homiMap?: unknown }).homiMap;
});

describe("MapViewGL: the map (WP-27 'Camera', 'Basemap and tiles')", () => {
  it("creates one map after the library loads: rotation, pitch and keyboard off, no world copies, no attribution", async () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const { container, map } = await mount();

    expect(FakeMap.created).toHaveLength(1);
    expect(container.querySelector('[data-map-view="gl"]')).not.toBeNull();
    expect(map.options).toMatchObject({
      center: [69.2797, 41.3111],
      zoom: 11,
      maxZoom: GL_MAX_ZOOM,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: false,
      renderWorldCopies: false,
      attributionControl: false,
      validateStyle: false,
      pixelRatio: 2,
    });
    expect(map.options.transformRequest).toBe(osmTransformRequest);
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalledOnce();
    expect((map.options.style as StyleSpecification).sources).toHaveProperty(OSM_SOURCE);
  });

  it("opens at the city's fit memory when there is one", async () => {
    writeFit(DEFAULT_CITY_VIEW.center, { center: [41.29, 69.24], zoom: 13 });
    const { map } = await mount();

    expect(map.options).toMatchObject({ center: [69.24, 41.29], zoom: 12 });
  });

  it("renders at pixel ratio 1 in lite mode and follows a lite change without a new map", async () => {
    vi.stubGlobal("devicePixelRatio", 1.5);
    const { map, update } = await mount({ lite: true });
    expect(map.options.pixelRatio).toBe(1);

    await update({ lite: false });
    expect(map.pixelRatio).toBe(1.5);
    expect(FakeMap.created).toHaveLength(1);
  });

  it("removes the map, its markers and their listeners on unmount", async () => {
    const { container, map, unmount } = await mount({ groups: GROUPS, responseId: 1 });
    expect(markers(container, "pin")).toHaveLength(3);

    unmount();

    expect(map.removed).toBe(true);
    expect(FakeMarker.all.every((marker) => !marker.element.isConnected)).toBe(true);
    expect([...map.handlers].filter(([, handlers]) => handlers.size > 0).map(([type]) => type)).toEqual([]);
  });

  it("is removed when the route is hidden and created again at the same camera when it shows", async () => {
    const props = viewProps({ groups: GROUPS, responseId: 1 });
    const tree = (mode: "visible" | "hidden") => createElement(Activity, { mode } as ActivityProps, <MapViewGL {...props} />);
    const view = render(tree("visible"));
    await flush();
    const [first] = FakeMap.created;
    first.moveTo({ lng: 69.31, lat: 41.33 }, 13.5);

    view.rerender(tree("hidden"));
    await flush();
    expect(first.removed).toBe(true);

    view.rerender(tree("visible"));
    await flush();
    expect(FakeMap.created).toHaveLength(2);
    const second = FakeMap.created[1];
    expect(second.options).toMatchObject({ center: [69.31, 41.33], zoom: 13.5 });
    expect(second.moves).toEqual([]);
    expect(markers(view.container, "pin")).toHaveLength(3);
  });

  it("exposes the map as window.homiMap only with ?mapdebug, and forgets it on removal", async () => {
    const plain = await mount();
    expect((window as Window & { homiMap?: unknown }).homiMap).toBeUndefined();
    plain.unmount();

    state.options = { override: null, debug: true };
    const debug = await mount();
    expect((window as Window & { homiMap?: unknown }).homiMap).toBe(debug.map);

    debug.unmount();
    expect((window as Window & { homiMap?: unknown }).homiMap).toBeUndefined();
  });
});

describe("MapViewGL: engine loading (WP-27 'States')", () => {
  const spinner = (root: ParentNode) => root.querySelector("[data-map-engine-loading]");

  it("shows the centred spinner beside the container until the library has loaded and the first map exists", async () => {
    let loaded: (module: MapLibreModule) => void = () => undefined;
    state.load.mockReturnValue(new Promise((resolve) => (loaded = resolve)));
    const { container } = await mount();

    expect(spinner(container)).not.toBeNull();
    expect(spinner(container)?.textContent).toBe("");
    expect(container.querySelector('[data-map-view="gl"]')).not.toBeNull();
    expect(FakeMap.created).toEqual([]);

    await act(async () => loaded(maplibre));

    expect(FakeMap.created).toHaveLength(1);
    expect(spinner(container)).toBeNull();
  });

  it.each([
    ["the library chunk rejects", () => state.load.mockRejectedValue(new Error("ChunkLoadError"))],
    ["the constructor throws", () => (FakeMap.throwOnCreate = new FakeGPUInitializationError("webgl2"))],
  ] as const)("drops the spinner when %s", async (_case, arrange) => {
    arrange();
    const onFail = vi.fn();
    const { container } = await mount({ onFail });

    expect(onFail).toHaveBeenCalledOnce();
    expect(spinner(container)).toBeNull();
  });
});

describe("MapViewGL: failures (LB-APP-019)", () => {
  it.each([
    ["no WebGL2: the constructor throws GPUInitializationError", () => (FakeMap.throwOnCreate = new FakeGPUInitializationError("webgl2")), "webgl"],
    ["any other constructor throw", () => (FakeMap.throwOnCreate = new TypeError("bad style")), "style"],
    ["the library chunk rejects", () => state.load.mockRejectedValue(new Error("ChunkLoadError")), "chunk"],
  ] as const)("%s → %s", async (_case, arrange, reason) => {
    arrange();
    const onFail = vi.fn();
    await mount({ onFail });

    expect(onFail.mock.calls).toEqual([[reason]]);
  });

  it("a worker that cannot start is a chunk failure, reported once", async () => {
    const onFail = vi.fn();
    const { map } = await mount({ onFail });

    map.fire("error", { error: new Error("Worker failed to load. Check that the worker URL is correct.") });
    map.fire("error", { error: new Error("Worker failed to load. Check that the worker URL is correct.") });

    expect(onFail.mock.calls).toEqual([["chunk"]]);
  });

  it("a lost context that cannot be restored is a WebGL failure; a raster tile error is none", async () => {
    const onFail = vi.fn();
    const { map } = await mount({ onFail });

    map.fire("error", { error: new Error("404"), sourceId: OSM_SOURCE });
    expect(onFail).not.toHaveBeenCalled();

    map.fire("webglcontextlost");
    map.fire("error", { error: new FakeGPUInitializationError("restore") });
    expect(onFail.mock.calls).toEqual([["webgl"]]);
  });

  it("a vector source error rebuilds the style on the raster and reports map_tiles_failed once per session", async () => {
    const onFail = vi.fn();
    const tiles = "https://cdn.homi.uz/map/uzbekistan.pmtiles";
    const first = await mount({ tiles, onFail });
    expect((first.map.options.style as StyleSpecification).sources).toHaveProperty(BASEMAP_SOURCE);

    first.map.fire("error", { error: new Error("404"), sourceId: BASEMAP_SOURCE });
    await flush();
    first.map.fire("error", { error: new Error("404"), sourceId: BASEMAP_SOURCE });
    await flush();

    expect(first.map.styles).toHaveLength(1);
    const [{ style, options }] = first.map.styles;
    expect(options).toEqual({ diff: true });
    expect(Object.keys(style.sources)).toEqual([OSM_SOURCE]);
    expect(onFail).not.toHaveBeenCalled();
    expect(state.reportError).toHaveBeenCalledOnce();
    expect(state.reportError.mock.calls[0][0]).toEqual(new Error("map_tiles_failed"));
    expect(state.reportError.mock.calls[0][1]).toEqual({ kind: "error" });

    first.unmount();
    const second = await mount({ tiles });
    expect(Object.keys((second.map.options.style as StyleSpecification).sources)).toEqual([OSM_SOURCE]);
    expect(state.reportError).toHaveBeenCalledOnce();
  });

  it("reports the basemap it draws: the vector source, then the raster after the source failed", async () => {
    const onBasemap = vi.fn<(basemap: Basemap) => void>();
    const tiles = "https://cdn.homi.uz/map/uzbekistan.pmtiles";
    const { map } = await mount({ tiles, onBasemap });
    expect(onBasemap.mock.calls).toEqual([[{ kind: "pmtiles", url: tiles }]]);

    map.fire("error", { error: new Error("404"), sourceId: BASEMAP_SOURCE });
    await flush();

    expect(onBasemap.mock.calls).toEqual([[{ kind: "pmtiles", url: tiles }], [{ kind: "raster" }]]);
  });
});

describe("MapViewGL: the style", () => {
  it("rebuilds the style with a diff on the same map when the scheme, the locale, the area or the position changes", async () => {
    const { map, update } = await mount();
    const background = (style: StyleSpecification) => JSON.stringify(style.layers[0]);

    await update({ onSelect: vi.fn() });
    expect(map.styles).toEqual([]);

    await update({ scheme: "dark" });
    expect(map.styles).toHaveLength(1);
    expect(map.styles[0].options).toEqual({ diff: true });
    expect(background(map.styles[0].style)).not.toBe(background(map.options.style as StyleSpecification));

    await update({
      polygon: [
        [41.3, 69.2],
        [41.35, 69.3],
        [41.25, 69.3],
      ],
    });
    expect(map.styles.at(-1)!.style.sources).toHaveProperty(MASK_SOURCE);

    await update({ me: { lat: 41.31, lon: 69.28, accuracy: 30 } });
    expect(map.styles.at(-1)!.style.sources).toHaveProperty(ME_SOURCE);
    expect(map.styles.every(({ options }) => (options as { diff: boolean }).diff)).toBe(true);
    expect(FakeMap.created).toHaveLength(1);
  });
});

describe("MapViewGL: the camera (SCR-011)", () => {
  it("fits a new answer — the first fit jumps, a later one eases for 500 ms — and not a regrouping", async () => {
    const { map, update } = await mount({ groups: GROUPS, responseId: 1 });

    expect(map.cameras[0]).toEqual({
      bounds: [
        [69.2, 41.25],
        [69.35, 41.35],
      ],
      options: { padding: FIT_PADDING, maxZoom: 13 },
    });
    expect(map.moves).toHaveLength(1);
    expect(map.moves[0].kind).toBe("jumpTo");
    expect(map.moves[0].options).toMatchObject({ zoom: 12 });
    expect(map.moves[0].options).not.toHaveProperty("duration");

    await update({ groups: [PIN_A, PIN_B, STACK] });
    expect(map.moves).toHaveLength(1);

    await update({ groups: [PIN_A, PIN_B], responseId: 2 });
    expect(map.moves).toHaveLength(2);
    expect(map.moves[1].kind).toBe("easeTo");
    expect(map.moves[1].options).toMatchObject({ duration: 500 });
    expect(map.cameras[1].bounds).toEqual([
      [69.2, 41.3],
      [69.3, 41.35],
    ]);
  });

  it("fits the polygon's box when the filters have one", async () => {
    const { map } = await mount({
      groups: GROUPS,
      responseId: 1,
      polygon: [
        [41.2, 69.1],
        [41.4, 69.15],
        [41.3, 69.4],
      ],
    });

    expect(map.cameras[0].bounds).toEqual([
      [69.1, 41.2],
      [69.4, 41.4],
    ]);
  });

  it("keeps the first fit for a city as its fit memory", async () => {
    const { update } = await mount({ groups: GROUPS, responseId: 1 });
    expect(readFit(DEFAULT_CITY_VIEW.center)).toEqual({ center: [41.3, 69.275], zoom: 13 });

    await update({ groups: [PIN_B], responseId: 2 });
    expect(readFit(DEFAULT_CITY_VIEW.center)).toEqual({ center: [41.3, 69.275], zoom: 13 });
  });

  it("jumps to a new city's view; its next answer fits and becomes that city's fit memory", async () => {
    const samarkand: CityView = { center: [39.6542, 66.9597], zoom: 12 };
    const { map, update } = await mount({ groups: GROUPS, responseId: 1 });

    await update({ cityView: { ...samarkand } });
    expect(map.moves).toHaveLength(2);
    expect(map.moves[1]).toEqual({ kind: "jumpTo", options: { center: [66.9597, 39.6542], zoom: 11 } });

    await update({ cityView: { ...samarkand } });
    expect(map.moves).toHaveLength(2);

    const there = group(39.65, 66.96, point(40));
    await update({ groups: [there], responseId: 2 });
    expect(map.moves[2].kind).toBe("easeTo");
    expect(readFit(samarkand.center)).toEqual({ center: [39.65, 66.96], zoom: 13 });
  });

  describe("until the city view is known (the Tashkent stand-in)", () => {
    const samarkand: CityView = { center: [39.6542, 66.9597], zoom: 12 };
    const there = group(39.65, 66.96, point(40));

    it("opens at the stand-in itself, not at Tashkent's fit memory, and saves no fit for it", async () => {
      const tashkentFit: CityView = { center: [41.29, 69.24], zoom: 13 };
      writeFit(DEFAULT_CITY_VIEW.center, tashkentFit);
      const { map } = await mount({ cityKnown: false, groups: [there], responseId: 1 });

      expect(map.options).toMatchObject({ center: [69.2797, 41.3111], zoom: 11 });
      expect(map.moves).toHaveLength(1);
      expect(readFit(DEFAULT_CITY_VIEW.center)).toEqual(tashkentFit);
    });

    it("the first known view after a fit is not a city change: the fit stays, and the next answer is the city's memory", async () => {
      const { map, update } = await mount({ cityKnown: false, groups: [there], responseId: 1 });
      expect(map.moves).toHaveLength(1);
      expect(readFit(DEFAULT_CITY_VIEW.center)).toBeNull();

      await update({ cityView: { ...samarkand }, cityKnown: true });
      expect(map.moves).toHaveLength(1);
      expect(readFit(samarkand.center)).toBeNull();

      await update({ groups: [there, group(39.66, 66.97, point(41))], responseId: 2 });
      expect(map.moves).toHaveLength(2);
      expect(map.moves[1].kind).toBe("easeTo");
      expect(readFit(samarkand.center)).toEqual({ center: [39.655, 66.965], zoom: 13 });
      expect(readFit(DEFAULT_CITY_VIEW.center)).toBeNull();
    });

    it("the first known view before any fit opens that city: its fit memory, else its view", async () => {
      writeFit(samarkand.center, { center: [39.66, 66.97], zoom: 14 });
      const { map, update } = await mount({ cityKnown: false });
      expect(map.moves).toEqual([]);

      await update({ cityView: { ...samarkand }, cityKnown: true });
      expect(map.moves).toEqual([{ kind: "jumpTo", options: { center: [66.97, 39.66], zoom: 13 } }]);

      const other = await mount({ cityKnown: false });
      await other.update({ cityView: { center: [40.1, 65.4], zoom: 13 }, cityKnown: true });
      expect(other.map.moves).toEqual([{ kind: "jumpTo", options: { center: [65.4, 40.1], zoom: 12 } }]);
    });

    it("a known city whose view is lost does not move the camera, and its next fit saves nothing under the stand-in", async () => {
      const { map, update } = await mount({ cityView: { ...samarkand }, groups: [there], responseId: 1 });
      expect(readFit(samarkand.center)).toEqual({ center: [39.65, 66.96], zoom: 13 });

      await update({ cityView: DEFAULT_CITY_VIEW, cityKnown: false });
      expect(map.moves).toHaveLength(1);

      await update({ groups: [group(41.3, 69.2, point(42))], responseId: 2 });
      expect(map.moves).toHaveLength(2);
      expect(readFit(DEFAULT_CITY_VIEW.center)).toBeNull();
    });
  });

  it("flies to each new position object, to zoom 15 (Leaflet) or closer, in 600 ms", async () => {
    const { map, update } = await mount();
    const me: MePosition = { lat: 41.32, lon: 69.25, accuracy: 25 };

    await update({ me });
    expect(map.moves).toEqual([{ kind: "flyTo", options: { center: [69.25, 41.32], zoom: 14, duration: 600 } }]);

    await update({ me, scheme: "dark" });
    expect(map.moves).toHaveLength(1);

    map.moveTo({ lng: 69.25, lat: 41.32 }, 15.5);
    await update({ me: { ...me, accuracy: 10 } });
    expect(map.moves[1].options).toMatchObject({ zoom: 15.5, duration: 600 });
  });
});

describe("MapViewGL: markers and taps (SCR-011, LB-APP-020)", () => {
  it("draws a label with markup as text", async () => {
    const { container } = await mount({ groups: [group(41.3, 69.2, point(5, { label: "<b>x</b><img src=x>" }))], responseId: 1 });

    const [pin] = markers(container, "pin");
    expect(pin.textContent).toBe("<b>x</b><img src=x>");
    expect(container.querySelector("b, img")).toBeNull();
  });

  it("draws pins, stacks and their counts centred on their locations", async () => {
    const { container } = await mount({ groups: GROUPS, responseId: 1 });

    expect(numbersOf(markers(container, "pin"))).toEqual(["1", "2", "3"]);
    const [stack] = markers(container, "stack");
    expect(stack.dataset).toMatchObject({ key: STACK.key, count: "3" });
    expect(stack.textContent).toBe("$3003");
    expect(markerOf(stack)).toMatchObject({ anchor: "center", lngLat: [69.35, 41.32] });
  });

  it("a background tap calls onBackground; a tap inside a marker selects it instead", async () => {
    const onBackground = vi.fn();
    const onSelect = vi.fn();
    const { container, map } = await mount({ groups: GROUPS, responseId: 1, onBackground, onSelect });

    map.click();
    expect(onBackground).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    map.click(markers(container, "stack")[0].querySelector(".pin-n")!);
    map.click(pinOf(container, 2));
    expect(onBackground).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls).toEqual([[[11, 12, 13], 0], [[2]]]);
  });

  it("marks the selected pin active and reuses the markers when the hidden set regroups", async () => {
    const { container, update } = await mount({ groups: GROUPS, responseId: 1 });
    const pinB = pinOf(container, 2);
    const active = () => numbersOf(markers(container, "pin").filter((pin) => pin.classList.contains("active")));

    await update({ selection: { numbers: [2], at: 0 } });
    expect(active()).toEqual(["2"]);
    expect(markers(container, "stack")[0].classList.contains("active")).toBe(false);

    await update({ groups: [PIN_B, PIN_C, STACK] });
    expect(numbersOf(markers(container, "pin"))).toEqual(["2", "3"]);
    expect(pinOf(container, 2)).toBe(pinB);
    expect(active()).toEqual(["2"]);
  });

  it("a selected stack spreads into labelled pins around a dot, stays open while zooming, and collapses with the selection", async () => {
    const onSelect = vi.fn();
    const { container, map, update } = await mount({ groups: GROUPS, responseId: 1, onSelect });
    const numbers = [11, 12, 13];

    await update({ selection: { numbers, at: 0 } });
    expect(markers(container, "stack")).toEqual([]);
    expect(markers(container, "dot")).toHaveLength(1);
    const spread = markers(container, "spread");
    expect(spread.map((pin) => pin.dataset.number)).toEqual(["11", "12", "13"]);
    expect(spread.map((pin) => markerOf(pin).offset)).toEqual(spreadStackLabels(STACK).map(({ dx, dy }) => [dx, dy]));
    expect(spread.map((pin) => markerOf(pin).lngLat)).toEqual([
      [69.35, 41.32],
      [69.35, 41.32],
      [69.35, 41.32],
    ]);
    expect(spread.map((pin) => pin.classList.contains("active"))).toEqual([true, false, false]);

    map.click(spread[2]);
    expect(onSelect.mock.calls).toEqual([[numbers, 2]]);
    await update({ selection: { numbers, at: 2 } });
    expect(spread.map((pin) => pin.classList.contains("active"))).toEqual([false, false, true]);

    map.moveTo({ lng: 69.3, lat: 41.3 }, 6.2);
    expect(markers(container, "spread")).toEqual(spread);
    expect(markers(container, "cluster")).toHaveLength(1);
    expect(markers(container, "cluster")[0].dataset.count).toBe("3");

    await update({ selection: null });
    expect(markers(container, "spread")).toEqual([]);
    expect(markers(container, "dot")).toEqual([]);
    expect(markers(container, "cluster")[0].dataset.count).toBe("6");
  });

  it("a cluster tap below maximum zoom plays a light haptic and eases to its leaves, at least to its expansion zoom", async () => {
    const onSelect = vi.fn();
    // 0.001° of longitude is 3 px at GL zoom 11 and separates at 16 (93 px against a 48-px radius).
    const close = [group(41.3, 69.2, point(1), point(2)), group(41.3, 69.201, point(3))];
    const { container, map } = await mount({ groups: close, onSelect });

    const [cluster] = markers(container, "cluster");
    expect(cluster.dataset.count).toBe("3");
    map.click(cluster);

    expect(state.impact).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(map.cameras.at(-1)).toEqual({
      bounds: [
        [69.2, 41.3],
        [69.201, 41.3],
      ],
      options: { padding: CLUSTER_PADDING, maxZoom: GL_MAX_ZOOM },
    });
    expect(map.moves).toHaveLength(1);
    expect(map.moves[0]).toMatchObject({ kind: "easeTo", options: { zoom: 16, duration: 500 } });
    const center = toLngLat(map.moves[0].options.center);
    expect(center.lng).toBeCloseTo(69.2005, 9);
    expect(center.lat).toBeCloseTo(41.3, 9);
  });

  it("a cluster tap at maximum zoom selects its listings cheapest first", async () => {
    const onSelect = vi.fn();
    // 0.0001° of longitude is about 19 px at GL zoom 17.
    const close = [
      group(41.3, 69.2, point(30, { usd: 700 }), point(31, { usd: null, priced: false })),
      group(41.3, 69.2001, point(32, { usd: 200 })),
    ];
    const { container, map } = await mount({ groups: close, onSelect, cityView: { center: DEFAULT_CITY_VIEW.center, zoom: 18 } });
    expect(map.getZoom()).toBe(GL_MAX_ZOOM);

    map.click(markers(container, "cluster")[0]);

    expect(onSelect.mock.calls).toEqual([[[32, 30, 31]]]);
    expect(state.impact).not.toHaveBeenCalled();
    expect(map.moves).toEqual([]);
  });

  it("keeps markers for the viewport plus 10 % and syncs them when the map stops moving", async () => {
    FakeMap.bounds = [
      [69.0, 41.0],
      [69.5, 41.5],
    ];
    const inside = group(41.3, 69.54, point(1));
    const outside = group(41.3, 69.6, point(2));
    const { container, map } = await mount({ groups: [inside, outside] });
    expect(numbersOf(markers(container, "pin"))).toEqual(["1"]);

    map.bounds = [
      [69.2, 41.0],
      [69.7, 41.5],
    ];
    map.moveTo({ lng: 69.45, lat: 41.25 }, map.getZoom());
    expect(numbersOf(markers(container, "pin"))).toEqual(["1", "2"]);
  });
});

describe("MapViewGL: the lasso (WP-28 'Lasso', SCR-012)", () => {
  const lasso = (root: ParentNode) => root.querySelector("[data-lasso]");
  const gestures = (map: FakeMap) => [map.dragPan, map.touchZoomRotate, map.scrollZoom, map.doubleClickZoom, map.boxZoom].map((handler) => handler.isEnabled());

  it("covers the map with the lasso overlay while drawing, once a map exists, with the map's own gestures off", async () => {
    let loaded: (module: MapLibreModule) => void = () => undefined;
    state.load.mockReturnValue(new Promise((resolve) => (loaded = resolve)));
    const { container, update } = await mount({ drawing: true, onDrawn: vi.fn(), onTooSmall: vi.fn() });
    expect(lasso(container)).toBeNull();

    await act(async () => loaded(maplibre));
    const [map] = FakeMap.created;
    expect(lasso(container)).not.toBeNull();
    expect(gestures(map)).toEqual([false, false, false, false, false]);

    await update({ drawing: false });
    expect(lasso(container)).toBeNull();
    expect(gestures(map)).toEqual([true, true, true, true, true]);
  });

  it("draws no overlay while not drawing", async () => {
    const { container, map } = await mount({ drawing: false, onDrawn: vi.fn(), onTooSmall: vi.fn() });

    expect(FakeMap.created).toEqual([map]);
    expect(lasso(container)).toBeNull();
    expect(gestures(map)).toEqual([true, true, true, true, true]);
  });
});
