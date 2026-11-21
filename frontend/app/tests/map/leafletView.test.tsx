import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { Map as LMap } from "leaflet";
import { Activity, type ActivityProps, createElement, StrictMode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type CameraMemory, DEFAULT_CITY_VIEW, FIT_MAX_ZOOM, forgetCameras, LOCATE_ZOOM, readFit } from "@/features/map/camera";
import { RASTER_CLASS } from "@/features/map/leaflet/basemap";
import { type LeafletLibrary, loadLeaflet } from "@/features/map/leaflet/library";
import MapViewLeaflet from "@/features/map/leaflet/MapViewLeaflet";
import { BASEMAP_DELAY_MS } from "@/features/map/leaflet/useDeferredBasemap";
import { LEAFLET_MAX_ZOOM, type LeafletHandle, useLeafletCamera } from "@/features/map/leaflet/useLeafletMap";
import { useLeafletMask } from "@/features/map/leaflet/useLeafletMask";
import { ME_DOT_RADIUS, useMyLocation } from "@/features/map/leaflet/useMyLocation";
import { paletteOf } from "@/features/map/palette";
import type { MapGroup, MapPoint, MapScheme, MapViewProps, MePosition } from "@/features/map/types";
import { resetBasemapForTests } from "@/features/map/useBasemap";

vi.mock("@/lib/deeplinks/launch", () => ({ launchMapOptions: () => ({ override: null, debug: false }) }));
vi.mock("@/lib/errors/report", () => ({ reportError: () => undefined }));
vi.mock("@/lib/telegram", () => ({ tg: { haptic: { impact: () => undefined } } }));
// The lasso is another part of WP-28; drawing is off in these tests.
vi.mock("@/features/map/leaflet/lassoHandlers", () => ({ useLassoHost: () => null }));
vi.mock("@/features/map/lasso/LassoOverlay", () => ({ LassoOverlay: () => null }));

function point(number: number): MapPoint {
  return { number, lat: 0, lon: 0, label: `$${number}`, tone: null, priced: true, usd: number };
}

function group(lat: number, lon: number, numbers: number[]): MapGroup {
  return { key: `${lat.toFixed(5)},${lon.toFixed(5)}`, lat, lon, items: numbers.map((number) => ({ ...point(number), lat, lon })) };
}

const GROUPS = [group(41.3, 69.2, [1]), group(41.35, 69.3, [2]), group(41.25, 69.25, [3, 4])];

let library: LeafletLibrary;

// jsdom lays nothing out: every element is 400 × 800, so Leaflet has a size to fit and cluster in.
beforeAll(async () => {
  library = await loadLeaflet();
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
});

afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});

beforeEach(() => {
  resetBasemapForTests();
  forgetCameras();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function viewProps(overrides: Partial<MapViewProps> = {}): MapViewProps {
  return {
    groups: [],
    responseId: 0,
    cameraKey: "city=tashkent",
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
    await loadLeaflet();
    await Promise.resolve();
  });
}

const maps = () => document.querySelectorAll(".leaflet-map-pane");

/** A camera hook's search and memory, as `MapViewLeaflet` passes them. */
function memoryOf(cameraKey = "city=tashkent"): { cameraKey: string; memoryRef: { current: CameraMemory } } {
  return { cameraKey, memoryRef: { current: { restored: null, placed: null } } };
}

describe("MapViewLeaflet (WP-28 'Leaflet view')", () => {
  it("leaves one map after StrictMode's double effect, and none after unmount", async () => {
    const created = vi.spyOn(library.L, "map");
    const removed = vi.spyOn(library.L.Map.prototype, "remove");
    const view = render(
      <StrictMode>
        <MapViewLeaflet {...viewProps({ groups: GROUPS, responseId: 1 })} />
      </StrictMode>,
    );
    expect(document.querySelector("[data-map-engine-loading]")).not.toBeNull();

    await flush();

    expect(document.querySelector("[data-map-engine-loading]")).toBeNull();

    expect(created).toHaveBeenCalledTimes(1);
    expect(maps()).toHaveLength(1);
    expect(document.querySelectorAll('[data-marker="pin"], [data-marker="stack"]').length).toBeGreaterThan(0);

    view.unmount();

    expect(removed).toHaveBeenCalledTimes(1);
    expect(maps()).toHaveLength(0);
    expect(document.querySelectorAll(".leaflet-marker-icon")).toHaveLength(0);
  });

  it("shows the palette's land colour under the map in each scheme", async () => {
    const view = render(<MapViewLeaflet {...viewProps()} />);
    await flush();
    const element = document.querySelector<HTMLElement>('[data-map-view="leaflet"]');
    expect(element?.style.backgroundColor).toBe("rgb(242, 242, 247)");

    view.rerender(<MapViewLeaflet {...viewProps({ scheme: "dark" })} />);
    expect(element?.style.backgroundColor).toBe("rgb(21, 21, 23)");
  });

  it("reports a tap on the map itself as a background tap, and a pin tap as a selection only", async () => {
    const props = viewProps({ groups: GROUPS, responseId: 1 });
    render(<MapViewLeaflet {...props} />);
    await flush();

    act(() => {
      document.querySelector('[data-marker="pin"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onBackground).not.toHaveBeenCalled();

    act(() => {
      document.querySelector(".leaflet-container")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onBackground).toHaveBeenCalledTimes(1);
  });

  it("is removed when the route is hidden, and shows the basemap at once when made again at the fitted camera", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const props = viewProps({ groups: GROUPS, responseId: 1 });
    const tree = (mode: "visible" | "hidden") => createElement(Activity, { mode } as ActivityProps, <MapViewLeaflet {...props} />);
    const view = render(tree("visible"));
    await flush();
    expect(document.querySelector(`.${RASTER_CLASS}`)).not.toBeNull();

    view.rerender(tree("hidden"));
    await flush();
    expect(maps()).toHaveLength(0);

    view.rerender(tree("visible"));
    await flush();
    expect(maps()).toHaveLength(1);
    // No 1.2 s wait: the camera is the earlier fit's.
    expect(document.querySelector(`.${RASTER_CLASS}`)).not.toBeNull();
  });

  it("waits up to 1.2 s for the basemap while no answer has been fitted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<MapViewLeaflet {...viewProps()} />);
    await flush();
    act(() => {
      vi.advanceTimersByTime(BASEMAP_DELAY_MS - 1);
    });
    expect(document.querySelector(`.${RASTER_CLASS}`)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(document.querySelector(`.${RASTER_CLASS}`)).not.toBeNull();
  });
});

describe("MapViewLeaflet: the camera memory of the launch (WP-37, BR-APP-111)", () => {
  /** The maps `L.map` made, oldest first. */
  function made() {
    const created = vi.spyOn(library.L, "map");
    return () => created.mock.results.map((result) => result.value as LMap);
  }

  it("a new mount with the same search opens where the map was left, fits nothing, and puts the basemap on at once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const all = made();
    const first = render(<MapViewLeaflet {...viewProps({ groups: GROUPS, responseId: 1 })} />);
    await flush();
    all()[0]!.setView([41.33, 69.31], 15, { animate: false });
    first.unmount();

    const props = viewProps({ groups: [], responseId: 0 });
    const second = render(<MapViewLeaflet {...props} />);
    await flush();
    const map = all()[1]!;
    expect(map.getCenter().lat).toBeCloseTo(41.33, 4);
    expect(map.getZoom()).toBe(15);
    const setView = vi.spyOn(map, "setView");
    const flyTo = vi.spyOn(map, "flyTo");

    second.rerender(<MapViewLeaflet {...props} groups={GROUPS} responseId={1} />);
    await flush();
    expect(setView).not.toHaveBeenCalled();
    expect(flyTo).not.toHaveBeenCalled();
    // No 1.2 s wait: the restored camera counts as the first fit.
    expect(document.querySelector(`.${RASTER_CLASS}`)).not.toBeNull();
  });

  it("a search changed after the restore fits; a search applied and left before it was fitted saves nothing", async () => {
    const all = made();
    const first = render(<MapViewLeaflet {...viewProps({ groups: GROUPS, responseId: 1 })} />);
    await flush();
    all()[0]!.setView([41.33, 69.31], 15, { animate: false });
    first.unmount();

    const props = viewProps({ groups: [], responseId: 0 });
    const changed = render(<MapViewLeaflet {...props} />);
    await flush();
    const map = all()[1]!;
    expect(map.getZoom()).toBe(15);
    changed.rerender(<MapViewLeaflet {...props} groups={GROUPS} responseId={1} cameraKey="city=tashkent&rooms=2" />);
    await flush();
    expect(map.getZoom()).not.toBe(15);

    // Applied on the mounted map, left before its answer: the next mount of either search opens without a memory.
    changed.rerender(<MapViewLeaflet {...props} groups={GROUPS} responseId={1} cameraKey="city=tashkent&deal=sale" />);
    await flush();
    map.setView([41.2, 69.2], 16, { animate: false });
    changed.unmount();
    render(<MapViewLeaflet {...viewProps({ cameraKey: "city=tashkent&deal=sale" })} />);
    await flush();
    expect(all()[2]!.getZoom()).not.toBe(16);
    cleanup();
    // Nor under the search before (rooms=2, the last one fitted): the camera moved for the sale search.
    render(<MapViewLeaflet {...viewProps({ cameraKey: "city=tashkent&rooms=2" })} />);
    await flush();
    expect(all()[3]!.getZoom()).not.toBe(16);
  });

  it("a restore keeps the city's fit memory of the first fit: a later fit of another search does not replace it", async () => {
    const all = made();
    const first = render(<MapViewLeaflet {...viewProps({ groups: GROUPS, responseId: 1 })} />);
    await flush();
    const memory = readFit(DEFAULT_CITY_VIEW.center);
    all()[0]!.setView([41.33, 69.31], 15, { animate: false });
    first.unmount();

    const props = viewProps({ groups: GROUPS, responseId: 1 });
    const second = render(<MapViewLeaflet {...props} />);
    await flush();
    second.rerender(<MapViewLeaflet {...props} groups={[group(41.36, 69.33, [7])]} responseId={2} cameraKey="city=tashkent&rooms=2" />);
    await flush();

    expect(all()[1]!.getZoom()).not.toBe(15);
    expect(readFit(DEFAULT_CITY_VIEW.center)).toEqual(memory);
  });

  it("another search fits; nothing is remembered before the basemap went on", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const all = made();
    const unfitted = render(<MapViewLeaflet {...viewProps()} />);
    await flush();
    all()[0]!.setView([41.33, 69.31], 15, { animate: false });
    unfitted.unmount();
    render(<MapViewLeaflet {...viewProps()} />);
    await flush();
    expect(all()[1]!.getZoom()).not.toBe(15);
    cleanup();

    const fitted = render(<MapViewLeaflet {...viewProps({ groups: GROUPS, responseId: 1 })} />);
    await flush();
    all()[2]!.setView([41.33, 69.31], 15, { animate: false });
    fitted.unmount();

    render(<MapViewLeaflet {...viewProps({ groups: GROUPS, responseId: 1, cameraKey: "city=tashkent&deal=sale" })} />);
    await flush();
    expect(all()[3]!.getZoom()).not.toBe(15);
  });
});

describe("useLeafletCamera (WP-28 'Camera')", () => {
  let map: LMap;
  let container: HTMLElement;

  function instance(): LeafletHandle["mapRef"] {
    container = document.createElement("div");
    document.body.append(container);
    const [lat, lon] = DEFAULT_CITY_VIEW.center;
    map = library.L.map(container, { center: [lat, lon], zoom: DEFAULT_CITY_VIEW.zoom, maxZoom: LEAFLET_MAX_ZOOM, zoomControl: false, attributionControl: false });
    return { current: { map, ...library } };
  }

  afterEach(() => {
    map.remove();
    container.remove();
  });

  it("jumps to the points on the first answer up to zoom 14, saves the city's fit, and answers fitted", () => {
    const handle: LeafletHandle = { mapRef: instance(), generation: 1 };
    const { result } = renderHook(() =>
      useLeafletCamera(handle, { responseId: 1, groups: [group(41.3111, 69.2797, [1])], polygon: null, cityView: DEFAULT_CITY_VIEW, cityKnown: true, ...memoryOf() }),
    );

    expect(result.current).toBe(true);
    expect(map.getZoom()).toBe(FIT_MAX_ZOOM);
    expect(map.getCenter().lat).toBeCloseTo(41.3111, 4);
    expect(readFit(DEFAULT_CITY_VIEW.center)).toEqual({ center: [41.3111, 69.2797], zoom: FIT_MAX_ZOOM });
  });

  it("answers fitted for a map made again after a fit, without fitting it again", () => {
    const input = { responseId: 1, groups: GROUPS, polygon: null, cityView: DEFAULT_CITY_VIEW, cityKnown: true, ...memoryOf() };
    const first: LeafletHandle = { mapRef: instance(), generation: 1 };
    const { result, rerender } = renderHook(({ handle }) => useLeafletCamera(handle, input), { initialProps: { handle: first } });
    expect(result.current).toBe(true);
    map.remove();
    container.remove();

    const second: LeafletHandle = { mapRef: instance(), generation: 2 };
    map.setView([41.4, 69.4], 9, { animate: false });
    rerender({ handle: second });

    expect(result.current).toBe(true);
    expect(map.getZoom()).toBe(9);
  });

  it("does not answer fitted for a map whose answer had nothing to fit", () => {
    const handle: LeafletHandle = { mapRef: instance(), generation: 1 };
    const { result } = renderHook(() =>
      useLeafletCamera(handle, { responseId: 1, groups: [], polygon: null, cityView: DEFAULT_CITY_VIEW, cityKnown: true, ...memoryOf() }),
    );

    expect(result.current).toBe(false);
  });
});

describe("useLeafletMask and useMyLocation (WP-28 'Leaflet view')", () => {
  let map: LMap;
  let container: HTMLElement;
  let handle: LeafletHandle;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    map = library.L.map(container, { center: [41.3111, 69.2797], zoom: 12, maxZoom: LEAFLET_MAX_ZOOM, zoomControl: false, attributionControl: false });
    handle = { mapRef: { current: { map, ...library } }, generation: 1 };
  });

  afterEach(() => {
    map.remove();
    container.remove();
  });

  const paths = () => [...container.querySelectorAll<SVGPathElement>("path")].filter((path) => path.getAttribute("d"));

  const AREA: [number, number][] = [
    [41.3, 69.2],
    [41.3, 69.3],
    [41.35, 69.3],
    [41.35, 69.2],
  ];

  it("dims the world outside a polygon and outlines it, recoloured with the scheme, removed with the polygon", () => {
    const { rerender } = renderHook(({ polygon, scheme }: { polygon: [number, number][] | null; scheme: MapScheme }) =>
      useLeafletMask(handle, polygon, scheme), { initialProps: { polygon: AREA, scheme: "light" } });

    const [fill, line] = paths();
    const light = paletteOf("light").mask;
    expect(paths()).toHaveLength(2);
    expect(fill.getAttribute("fill")).toBe(light.fill);
    expect(fill.getAttribute("fill-opacity")).toBe("1");
    expect(fill.getAttribute("fill-rule")).toBe("evenodd");
    expect(fill.getAttribute("stroke")).toBe("none");
    // The world ring and the area's ring, as one path with a hole.
    expect(fill.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(line.getAttribute("stroke")).toBe(light.outline);
    expect(line.getAttribute("stroke-width")).toBe("2");
    expect(line.getAttribute("fill")).toBe("none");
    expect(paths().some((path) => path.classList.contains("leaflet-interactive"))).toBe(false);

    rerender({ polygon: AREA, scheme: "dark" });
    expect(paths()[0].getAttribute("fill")).toBe(paletteOf("dark").mask.fill);

    rerender({ polygon: null, scheme: "dark" });
    expect(paths()).toHaveLength(0);
  });

  it("draws the dot of radius 7 and the accuracy circle only under 2 km, above the mask", () => {
    const near: MePosition = { lat: 41.31, lon: 69.28, accuracy: 120 };
    const { rerender } = renderHook(({ me }: { me: MePosition | null }) => {
      useLeafletMask(handle, AREA, "light");
      useMyLocation(handle, me, "light");
    }, { initialProps: { me: near as MePosition | null } });

    const colors = paletteOf("light").me;
    const [mask, outline, accuracy, dot] = paths();
    expect(paths()).toHaveLength(4);
    expect(mask.getAttribute("fill")).toBe(paletteOf("light").mask.fill);
    expect(outline.getAttribute("stroke")).toBe(paletteOf("light").mask.outline);
    expect(accuracy.getAttribute("fill")).toBe(colors.accuracy);
    expect(accuracy.getAttribute("stroke")).toBe(colors.accuracyOutline);
    expect(dot.getAttribute("fill")).toBe(colors.dot);
    expect(dot.getAttribute("stroke")).toBe(colors.ring);
    expect(ME_DOT_RADIUS).toBe(7);

    rerender({ me: { lat: 41.31, lon: 69.28, accuracy: 2000 } });
    expect(paths()).toHaveLength(3);
    rerender({ me: { lat: 41.31, lon: 69.28, accuracy: null } });
    expect(paths()).toHaveLength(3);
    rerender({ me: null });
    expect(paths()).toHaveLength(2);
  });

  it("flies to each new position at zoom 15 or closer, once per position", () => {
    const first: MePosition = { lat: 41.33, lon: 69.31, accuracy: 50 };
    const { rerender } = renderHook(({ me }: { me: MePosition }) => useMyLocation(handle, me, "light"), { initialProps: { me: first } });

    expect(map.getZoom()).toBe(LOCATE_ZOOM);
    expect(map.getCenter().lat).toBeCloseTo(41.33, 4);

    map.setView([41.2, 69.2], 17, { animate: false });
    rerender({ me: first });
    expect(map.getCenter().lat).toBeCloseTo(41.2, 4);

    rerender({ me: { lat: 41.34, lon: 69.32, accuracy: 50 } });
    expect(map.getZoom()).toBe(17);
    expect(map.getCenter().lat).toBeCloseTo(41.34, 4);
  });

  it("does not fly again to the same position when the map is made again (an Activity re-show)", () => {
    const me: MePosition = { lat: 41.33, lon: 69.31, accuracy: 50 };
    const { rerender } = renderHook(({ current }: { current: LeafletHandle }) => useMyLocation(current, me, "light"), {
      initialProps: { current: handle },
    });
    map.remove();
    container.remove();
    container = document.createElement("div");
    document.body.append(container);
    map = library.L.map(container, { center: [41.2, 69.2], zoom: 11, maxZoom: LEAFLET_MAX_ZOOM, zoomControl: false, attributionControl: false });

    rerender({ current: { mapRef: { current: { map, ...library } }, generation: 2 } });

    expect(map.getZoom()).toBe(11);
    expect(map.getCenter().lat).toBeCloseTo(41.2, 4);
    expect(paths()).toHaveLength(2);
  });
});
