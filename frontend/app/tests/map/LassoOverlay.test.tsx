import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ impact: vi.fn() }));
vi.mock("@/lib/telegram", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/telegram")>();
  return { ...original, tg: { ...original.tg, haptic: { impact: state.impact, success: vi.fn(), error: vi.fn() } } };
});

import { type LassoHost, LassoOverlay } from "@/features/map/lasso/LassoOverlay";
import { LASSO_RESYNC_MS, lassoToPolygon } from "@/features/map/lasso/polygon";

/** A flat projection: 1 px is 1e-4°. */
const project = (x: number, y: number) => [41.3 - y * 1e-4, 69.2 + x * 1e-4] as const;

const host = {
  unproject: vi.fn<LassoHost["unproject"]>(project),
  panBy: vi.fn<LassoHost["panBy"]>(),
  zoomAround: vi.fn<LassoHost["zoomAround"]>(),
};
const onDrawn = vi.fn();
const onTooSmall = vi.fn();
const setPointerCapture = vi.fn();
const captureDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "setPointerCapture");

function box(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

/** The overlay at 0, 70 (under the top bar), 400 × 600. */
function mount(): HTMLElement {
  render(<LassoOverlay host={host} onDrawn={onDrawn} onTooSmall={onTooSmall} />);
  const overlay = document.querySelector<HTMLElement>("[data-lasso]")!;
  vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(box(0, 70, 400, 600));
  return overlay;
}

type Init = { pointerType?: string; button?: number };
const at = (pointerId: number, x: number, y: number, init: Init = {}) => ({
  pointerId,
  pointerType: "touch",
  button: 0,
  clientX: x,
  clientY: y,
  ...init,
});
const outline = () => document.querySelector("[data-lasso-stroke]")?.getAttribute("points") ?? null;

/** A 200 px square drawn by pointer 1 from (100, 100), not yet lifted. */
function drawSquare(overlay: HTMLElement): void {
  fireEvent.pointerDown(overlay, at(1, 100, 100));
  for (const [x, y] of [
    [300, 100],
    [300, 300],
    [100, 300],
    [100, 105],
  ]) {
    fireEvent.pointerMove(overlay, at(1, x, y));
  }
}

beforeEach(() => {
  for (const mock of [state.impact, host.panBy, host.zoomAround, onDrawn, onTooSmall, setPointerCapture]) {
    mock.mockReset();
  }
  host.unproject.mockReset().mockImplementation(project);
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: setPointerCapture });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (captureDescriptor === undefined) {
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  } else {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", captureDescriptor);
  }
});

describe("LassoOverlay: the stroke (SCR-012, WP-28 \"Lasso\")", () => {
  it("the first pointer draws with pointer capture and a light haptic; a point closer than 4 px is skipped", () => {
    const overlay = mount();

    fireEvent.pointerDown(overlay, at(1, 100, 100));
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(state.impact).toHaveBeenCalledTimes(1);
    expect(outline()).toBe("100,30");

    fireEvent.pointerMove(overlay, at(1, 103, 100));
    fireEvent.pointerMove(overlay, at(1, 102, 102));
    expect(outline()).toBe("100,30");
    fireEvent.pointerMove(overlay, at(1, 104, 100));
    expect(outline()).toBe("100,30 104,30");
    expect(state.impact).toHaveBeenCalledTimes(1);
  });

  it("clamps a point outside the overlay to its box", () => {
    const overlay = mount();

    fireEvent.pointerDown(overlay, at(1, 100, 100));
    fireEvent.pointerMove(overlay, at(1, 520, 20));
    fireEvent.pointerMove(overlay, at(1, -30, 900));

    expect(outline()).toBe("100,30 400,0 0,600");
  });

  it("lifting the pointer finishes: a valid stroke gives `onDrawn` with its polygon, and the outline clears", () => {
    const overlay = mount();
    drawSquare(overlay);

    fireEvent.pointerUp(overlay, at(1, 100, 105));

    const expected = lassoToPolygon(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 },
        { x: 100, y: 105 },
      ],
      project,
    );
    expect(onDrawn).toHaveBeenCalledTimes(1);
    expect(onDrawn).toHaveBeenCalledWith(expected);
    expect(expected).toHaveLength(4);
    expect(onTooSmall).not.toHaveBeenCalled();
    expect(outline()).toBeNull();
    expect(host.unproject).toHaveBeenCalledWith(100, 100);
  });

  it("a stroke too small to search in gives `onTooSmall`", () => {
    const overlay = mount();

    fireEvent.pointerDown(overlay, at(1, 100, 100));
    fireEvent.pointerMove(overlay, at(1, 130, 100));
    fireEvent.pointerMove(overlay, at(1, 130, 300));
    fireEvent.pointerUp(overlay, at(1, 100, 300));

    expect(onTooSmall).toHaveBeenCalledTimes(1);
    expect(onDrawn).not.toHaveBeenCalled();
    expect(outline()).toBeNull();

    // A tap is a stroke too.
    fireEvent.pointerDown(overlay, at(2, 50, 50));
    fireEvent.pointerUp(overlay, at(2, 50, 50));
    expect(onTooSmall).toHaveBeenCalledTimes(2);
  });

  it("losing the pointer's capture finishes the stroke as a lift does, once", () => {
    const overlay = mount();
    drawSquare(overlay);

    fireEvent.lostPointerCapture(overlay, { pointerId: 1 });
    expect(onDrawn).toHaveBeenCalledTimes(1);
    expect(outline()).toBeNull();

    fireEvent.pointerUp(overlay, at(1, 100, 105));
    fireEvent.pointerCancel(overlay, { pointerId: 1 });
    expect(onDrawn).toHaveBeenCalledTimes(1);
    expect(onTooSmall).not.toHaveBeenCalled();
  });

  it("a mouse draws the same way, with its main button only", () => {
    const overlay = mount();

    fireEvent.pointerDown(overlay, at(1, 100, 100, { pointerType: "mouse", button: 2 }));
    expect(outline()).toBeNull();
    expect(setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerDown(overlay, at(1, 100, 100, { pointerType: "mouse" }));
    for (const [x, y] of [
      [300, 100],
      [300, 300],
      [100, 300],
    ]) {
      fireEvent.pointerMove(overlay, at(1, x, y, { pointerType: "mouse" }));
    }
    fireEvent.pointerUp(overlay, at(1, 100, 300, { pointerType: "mouse" }));

    expect(state.impact).toHaveBeenCalledTimes(1);
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });

  it("gives the host the container's pixels: the client point minus the corner of the box that holds the map", () => {
    const { container } = render(<LassoOverlay host={host} onDrawn={onDrawn} onTooSmall={onTooSmall} />);
    const overlay = container.querySelector<HTMLElement>("[data-lasso]")!;
    const screen = document.createElement("div");
    vi.spyOn(screen, "getBoundingClientRect").mockReturnValue(box(10, 20, 400, 700));
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(box(10, 90, 400, 600));
    Object.defineProperty(overlay, "offsetParent", { configurable: true, get: () => screen });

    fireEvent.pointerDown(overlay, at(1, 110, 120));
    fireEvent.pointerMove(overlay, at(1, 310, 120));
    fireEvent.pointerMove(overlay, at(1, 310, 320));
    expect(outline()).toBe("100,30 300,30 300,230");
    fireEvent.pointerUp(overlay, at(1, 110, 320));

    expect(host.unproject.mock.calls.map(([x, y]) => [x, y])).toEqual([
      [100, 100],
      [300, 100],
      [300, 300],
      [100, 300],
    ]);
  });
});

describe("LassoOverlay: two pointers", () => {
  it("a second pointer drops the stroke; the two pan and pinch the map, applied once per animation frame", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const overlay = mount();
    fireEvent.pointerDown(overlay, at(1, 100, 100));
    fireEvent.pointerMove(overlay, at(1, 150, 100));

    fireEvent.pointerDown(overlay, at(2, 200, 100));
    expect(outline()).toBeNull();
    expect(state.impact).toHaveBeenCalledTimes(1);

    // Midpoint (175, 100), 50 px apart → (170, 110), 120 px apart: one frame, one pan, one zoom.
    fireEvent.pointerMove(overlay, at(1, 120, 110));
    fireEvent.pointerMove(overlay, at(1, 110, 110));
    fireEvent.pointerMove(overlay, at(2, 230, 110));
    expect(host.panBy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersToNextFrame());
    expect(host.panBy).toHaveBeenCalledTimes(1);
    expect(host.panBy).toHaveBeenCalledWith(-5, 10);
    expect(host.zoomAround).toHaveBeenCalledTimes(1);
    expect(host.zoomAround).toHaveBeenCalledWith(170, 110, 2.4);
    // Drawing stays off while the fingers move.
    expect(outline()).toBeNull();

    // A pan alone zooms nothing; the move pending at a lift is applied first.
    fireEvent.pointerMove(overlay, at(1, 130, 110));
    fireEvent.pointerMove(overlay, at(2, 250, 110));
    fireEvent.pointerUp(overlay, at(2, 250, 110));
    expect(host.panBy).toHaveBeenCalledTimes(2);
    expect(host.panBy).toHaveBeenLastCalledWith(20, 0);
    expect(host.zoomAround).toHaveBeenCalledTimes(1);

    // The finger left alone moves nothing and finishes nothing.
    fireEvent.pointerMove(overlay, at(1, 160, 160));
    act(() => vi.advanceTimersToNextFrame());
    fireEvent.pointerUp(overlay, at(1, 160, 160));
    expect(host.panBy).toHaveBeenCalledTimes(2);
    expect(onDrawn).not.toHaveBeenCalled();
    expect(onTooSmall).not.toHaveBeenCalled();

    // Every pointer up: the next one draws again.
    fireEvent.pointerDown(overlay, at(3, 100, 100));
    expect(state.impact).toHaveBeenCalledTimes(2);
    expect(outline()).toBe("100,30");
  });

  it("a third pointer is ignored, and an unmount drops a pending frame", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const overlay = mount();
    fireEvent.pointerDown(overlay, at(1, 100, 100));
    fireEvent.pointerDown(overlay, at(2, 200, 100));
    fireEvent.pointerDown(overlay, at(3, 300, 300));
    expect(setPointerCapture).toHaveBeenCalledTimes(2);

    fireEvent.pointerMove(overlay, at(3, 320, 320));
    act(() => vi.advanceTimersToNextFrame());
    expect(host.panBy).not.toHaveBeenCalled();

    fireEvent.pointerMove(overlay, at(1, 110, 100));
    cleanup();
    act(() => vi.advanceTimersToNextFrame());
    expect(host.panBy).not.toHaveBeenCalled();
    expect(host.zoomAround).not.toHaveBeenCalled();
  });
});

type FakeHandler = { isEnabled: () => boolean; enabled: () => boolean; enable: () => void; disable: () => void };

/** A gesture handler of either library: `isEnabled` (MapLibre) and `enabled` (Leaflet) read the same flag. */
function handler(on = true): FakeHandler {
  let enabled = on;
  return {
    isEnabled: () => enabled,
    enabled: () => enabled,
    enable: vi.fn(() => {
      enabled = true;
    }),
    disable: vi.fn(() => {
      enabled = false;
    }),
  };
}

describe("the GL host (GlLasso)", () => {
  function glMap() {
    return {
      unproject: vi.fn(([x, y]: [number, number]) => {
        const [lat, lon] = project(x, y);
        return { lat, lng: lon };
      }),
      panBy: vi.fn(),
      zoomTo: vi.fn(),
      getZoom: () => 11,
      dragPan: handler(),
      touchZoomRotate: handler(),
      scrollZoom: handler(),
      doubleClickZoom: handler(),
      boxZoom: handler(false),
    };
  }

  async function mountGl(map: ReturnType<typeof glMap>, generation = 1) {
    const { GlLasso } = await import("@/features/map/gl/GlLasso");
    const handle = { mapRef: { current: generation > 0 ? { map, maplibre: {} } : null }, generation } as never;
    const view = render(<GlLasso handle={handle} onDrawn={onDrawn} onTooSmall={onTooSmall} />);
    const overlay = document.querySelector<HTMLElement>("[data-lasso]");
    if (overlay !== null) {
      vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(box(0, 70, 400, 600));
    }
    return { view, overlay };
  }

  it("draws over the map with its `unproject`; the map's own gestures are off until the lasso goes", async () => {
    const map = glMap();
    const { view, overlay } = await mountGl(map);

    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
    expect(map.touchZoomRotate.disable).toHaveBeenCalledTimes(1);
    expect(map.scrollZoom.disable).toHaveBeenCalledTimes(1);
    expect(map.doubleClickZoom.disable).toHaveBeenCalledTimes(1);
    expect(map.boxZoom.disable).not.toHaveBeenCalled();

    drawSquare(overlay!);
    fireEvent.pointerUp(overlay!, at(1, 100, 105));
    expect(map.unproject).toHaveBeenCalledWith([100, 100]);
    expect(onDrawn).toHaveBeenCalledWith([
      [41.29, 69.21],
      [41.29, 69.23],
      [41.27, 69.23],
      [41.27, 69.21],
    ]);

    view.unmount();
    expect(map.dragPan.enable).toHaveBeenCalledTimes(1);
    expect(map.touchZoomRotate.enable).toHaveBeenCalledTimes(1);
    expect(map.boxZoom.enable).not.toHaveBeenCalled();
  });

  it("two fingers pan the content with them and zoom by log2(scale) around their midpoint, at once, tagged", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { LASSO_MOVE } = await import("@/features/map/gl/GlLasso");
    const map = glMap();
    const { overlay } = await mountGl(map);

    fireEvent.pointerDown(overlay!, at(1, 150, 100));
    fireEvent.pointerDown(overlay!, at(2, 200, 100));
    fireEvent.pointerMove(overlay!, at(1, 110, 110));
    fireEvent.pointerMove(overlay!, at(2, 230, 110));
    act(() => vi.advanceTimersToNextFrame());

    expect(map.panBy).toHaveBeenCalledWith([5, -10], { animate: false }, LASSO_MOVE);
    expect(map.zoomTo).toHaveBeenCalledTimes(1);
    const [zoom, options, data] = map.zoomTo.mock.calls[0] as [number, { animate: boolean; around: unknown }, unknown];
    expect(zoom).toBeCloseTo(11 + Math.log2(2.4), 10);
    expect(map.unproject).toHaveBeenLastCalledWith([170, 110]);
    expect(options).toEqual({ animate: false, around: map.unproject.mock.results.at(-1)?.value });
    expect(data).toBe(LASSO_MOVE);
  });

  it("renders nothing before the first map", async () => {
    const { overlay } = await mountGl(glMap(), 0);

    expect(overlay).toBeNull();
  });
});

describe("the Leaflet host (leafletLasso, useLassoHost)", () => {
  function leafletMap(zoom = 12) {
    let current = zoom;
    let removed = false;
    return {
      fire: vi.fn(),
      _rawPanBy: vi.fn(),
      getZoom: () => current,
      getMinZoom: () => 0,
      getMaxZoom: () => 18,
      setZoomAround: vi.fn((_point: unknown, next: number) => {
        current = next;
      }),
      containerPointToLatLng: vi.fn(([x, y]: [number, number]) => {
        const [lat, lon] = project(x, y);
        return { lat, lng: lon };
      }),
      getPane: (name: string) => (removed || name !== "mapPane" ? undefined : ({} as HTMLElement)),
      remove: () => {
        removed = true;
      },
      dragging: handler(),
      touchZoom: handler(),
      doubleClickZoom: handler(),
      scrollWheelZoom: handler(),
      boxZoom: handler(),
      tapHold: undefined,
    };
  }
  const L = { point: (x: number, y: number) => ({ x, y }) };
  const instanceOf = (map: ReturnType<typeof leafletMap>) => ({ map, L, protomaps: {} }) as never;
  const events = (map: ReturnType<typeof leafletMap>) => map.fire.mock.calls.map(([name]) => name as string);

  it("pans the pane as Leaflet's drag does: `movestart` once, `move` per frame, `moveend` 150 ms after the last", async () => {
    vi.useFakeTimers();
    const { leafletLasso } = await import("@/features/map/leaflet/lassoHandlers");
    const map = leafletMap();
    const lasso = leafletLasso();
    expect(LASSO_RESYNC_MS).toBe(150);

    lasso.panBy(instanceOf(map), 5, -10);
    vi.advanceTimersByTime(100);
    lasso.panBy(instanceOf(map), 3, 0);

    expect(map._rawPanBy.mock.calls).toEqual([[{ x: -5, y: 10 }], [{ x: -3, y: -0 }]]);
    expect(events(map)).toEqual(["movestart", "move", "move"]);
    vi.advanceTimersByTime(LASSO_RESYNC_MS - 1);
    expect(events(map)).not.toContain("moveend");
    vi.advanceTimersByTime(1);
    expect(events(map)).toEqual(["movestart", "move", "move", "moveend"]);

    expect(lasso.unproject(instanceOf(map), 100, 100)).toEqual(project(100, 100));
    expect(lasso.unproject(null, 100, 100)).toEqual([Number.NaN, Number.NaN]);
  });

  it("zooms in whole steps once the pinch's log2(scale) adds up to ±1; the sum resets when the gesture settles", async () => {
    vi.useFakeTimers();
    const { leafletLasso } = await import("@/features/map/leaflet/lassoHandlers");
    const map = leafletMap(12);
    const lasso = leafletLasso();

    lasso.zoomAround(instanceOf(map), 170, 110, 1.5);
    expect(map.setZoomAround).not.toHaveBeenCalled();
    lasso.zoomAround(instanceOf(map), 170, 110, 1.5);
    expect(map.setZoomAround).toHaveBeenCalledWith({ x: 170, y: 110 }, 13, { animate: false });
    lasso.zoomAround(instanceOf(map), 170, 110, 0.5);
    expect(map.setZoomAround).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(LASSO_RESYNC_MS);
    // Without the reset, -0.83 and this -0.74 would make a step out.
    lasso.zoomAround(instanceOf(map), 170, 110, 0.6);
    expect(map.setZoomAround).toHaveBeenCalledTimes(1);

    const top = leafletMap(18);
    lasso.zoomAround(instanceOf(top), 0, 0, 4);
    expect(top.setZoomAround).not.toHaveBeenCalled();
  });

  it("`useLassoHost`: a host only while drawing on a map, the gestures off meanwhile; leaving settles and resumes", async () => {
    vi.useFakeTimers();
    const { renderHook } = await import("@testing-library/react");
    const { useLassoHost } = await import("@/features/map/leaflet/lassoHandlers");
    const map = leafletMap();
    const handle = { mapRef: { current: instanceOf(map) }, generation: 1 } as never;
    const hook = renderHook(({ drawing }) => useLassoHost(handle, drawing), { initialProps: { drawing: false } });
    expect(hook.result.current).toBeNull();
    expect(map.dragging.disable).not.toHaveBeenCalled();

    hook.rerender({ drawing: true });
    const host = hook.result.current!;
    expect(map.dragging.disable).toHaveBeenCalledTimes(1);
    expect(map.touchZoom.disable).toHaveBeenCalledTimes(1);
    host.panBy(4, 4);
    expect(map._rawPanBy).toHaveBeenCalledWith({ x: -4, y: -4 });

    hook.rerender({ drawing: false });
    expect(hook.result.current).toBeNull();
    expect(events(map)).toEqual(["movestart", "move", "moveend"]);
    expect(map.dragging.enable).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(events(map)).toHaveLength(3);
  });

  it("a removed map gets no `moveend` and no gestures back: the next map reuses its container", async () => {
    vi.useFakeTimers();
    const { leafletLasso, pauseGestures } = await import("@/features/map/leaflet/lassoHandlers");
    const map = leafletMap();
    const lasso = leafletLasso();
    const resume = pauseGestures(map as never);
    lasso.panBy(instanceOf(map), 4, 4);

    map.remove();
    lasso.settle();
    resume();

    expect(events(map)).toEqual(["movestart", "move"]);
    expect(map.dragging.enable).not.toHaveBeenCalled();
  });
});
