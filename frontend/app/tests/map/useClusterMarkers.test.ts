import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LASSO_MOVE } from "@/features/map/gl/GlLasso";
import type { MapLibreModule } from "@/features/map/gl/library";
import { buildClusterIndex } from "@/features/map/gl/useClusterIndex";
import { useClusterMarkers } from "@/features/map/gl/useClusterMarkers";
import type { GlMap, MapHandle } from "@/features/map/gl/useMapInstance";
import { LASSO_RESYNC_MS } from "@/features/map/lasso/polygon";
import type { MapGroup, MapPoint } from "@/features/map/types";

vi.mock("@/lib/telegram", () => ({
  tg: { haptic: { impact: () => undefined, success: () => undefined, error: () => undefined } },
}));

type Box = [[west: number, south: number], [east: number, north: number]];
type Handler = (event: Record<string, unknown>) => void;

/** The parts of MapLibre's `Map` the marker layer reads; a test moves the camera by setting it and firing events. */
class FakeMap {
  readonly handlers = new Map<string, Set<Handler>>();
  readonly container = document.createElement("div");
  zoom = 11.5;
  bounds: Box = VIEW;

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

  fire(type: string, data: object = {}): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) {
      handler({ type, target: this, ...data });
    }
  }

  /** The event types something still listens to. */
  listening(): string[] {
    return [...this.handlers].filter(([, handlers]) => handlers.size > 0).map(([type]) => type);
  }

  getZoom(): number {
    return this.zoom;
  }

  getBounds(): { toArray(): Box } {
    return { toArray: () => this.bounds };
  }

  getCanvasContainer(): HTMLElement {
    return this.container;
  }
}

class FakeMarker {
  readonly element: HTMLElement;

  constructor({ element }: { element: HTMLElement }) {
    this.element = element;
  }

  setLngLat(): this {
    return this;
  }

  setOffset(): this {
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

/** The visible box: with the 10 % margin, markers are kept from 68.95 to 69.55 east. */
const VIEW: Box = [
  [69.0, 41.0],
  [69.5, 41.5],
];
/** The same box 0.2° east, which brings `OUTSIDE` in. */
const PANNED: Box = [
  [69.2, 41.0],
  [69.7, 41.5],
];

function point(number: number): MapPoint {
  return { number, lat: 41.3, lon: 69.3, label: `$${number}`, tone: null, priced: true, usd: number };
}

function group(lat: number, lon: number, item: MapPoint): MapGroup {
  return { key: `${lat.toFixed(5)},${lon.toFixed(5)}`, lat, lon, items: [{ ...item, lat, lon }] };
}

const INSIDE = group(41.3, 69.4, point(1));
const OUTSIDE = group(41.3, 69.6, point(2));
/** 0.012° of longitude apart: 35 px at GL zoom 11, clustered against the 48-px radius, and 70 px at 12. */
const NEAR = [group(41.3, 69.1, point(3)), group(41.3, 69.112, point(4))];

let map: FakeMap;

function mount(groups: readonly MapGroup[]) {
  map = new FakeMap();
  const handle: MapHandle = {
    mapRef: { current: { map: map as unknown as GlMap, maplibre: { Marker: FakeMarker } as unknown as MapLibreModule } },
    generation: 1,
  };
  const input = { index: buildClusterIndex(groups), spread: null, selection: null, onSelect: vi.fn() };
  return renderHook(() => useClusterMarkers(handle, input));
}

function markers(kind: string): HTMLElement[] {
  return [...map.container.querySelectorAll<HTMLElement>(`[data-marker="${kind}"]`)];
}

function pins(): string[] {
  return markers("pin")
    .map((pin) => pin.dataset.number!)
    .sort();
}

beforeEach(() => {
  // Only the layer's own timer: `vi.getTimerCount()` then counts the pending re-sync.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useClusterMarkers: the lasso's two-finger moves (WP-28 'Lasso', second pointer)", () => {
  it("re-syncs LASSO_RESYNC_MS after the last lasso moveend, each one starting the wait again", () => {
    mount([INSIDE, OUTSIDE]);
    expect(pins()).toEqual(["1"]);

    map.bounds = PANNED;
    map.fire("moveend", LASSO_MOVE);
    vi.advanceTimersByTime(LASSO_RESYNC_MS - 1);
    expect(pins()).toEqual(["1"]);

    map.fire("moveend", LASSO_MOVE);
    vi.advanceTimersByTime(LASSO_RESYNC_MS - 1);
    expect(pins()).toEqual(["1"]);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1);
    expect(pins()).toEqual(["1", "2"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a plain moveend drops the pending re-sync and syncs at once", () => {
    mount([INSIDE, OUTSIDE]);
    map.bounds = PANNED;
    map.fire("moveend", LASSO_MOVE);

    map.fire("moveend");
    expect(pins()).toEqual(["1", "2"]);
    expect(vi.getTimerCount()).toBe(0);

    // A re-sync still pending would now follow this box.
    map.bounds = VIEW;
    vi.advanceTimersByTime(LASSO_RESYNC_MS);
    expect(pins()).toEqual(["1", "2"]);
  });

  it("a lasso zoom across a whole zoom waits for the re-sync too, and a plain zoom back re-clusters at once", () => {
    mount(NEAR);
    expect(markers("cluster")).toHaveLength(1);
    expect(pins()).toEqual([]);

    // `zoomTo` fires `zoom` and then `moveend`, both with the lasso's event data.
    map.zoom = 12.2;
    map.fire("zoom", LASSO_MOVE);
    map.fire("moveend", LASSO_MOVE);
    expect(markers("cluster")).toHaveLength(1);

    vi.advanceTimersByTime(LASSO_RESYNC_MS);
    expect(markers("cluster")).toEqual([]);
    expect(pins()).toEqual(["3", "4"]);

    // The lasso zoom recorded the level it reached, so leaving it is a change.
    map.zoom = 11.5;
    map.fire("zoom");
    expect(markers("cluster")).toHaveLength(1);
    expect(pins()).toEqual([]);
  });

  it("drops a pending re-sync when the layer is destroyed", () => {
    const { unmount } = mount([INSIDE, OUTSIDE]);
    map.bounds = PANNED;
    map.fire("moveend", LASSO_MOVE);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(map.listening()).toEqual([]);
    expect(map.container.children).toHaveLength(0);
  });
});
