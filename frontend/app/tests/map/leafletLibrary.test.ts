import type { Map as LMap } from "leaflet";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { type LeafletLibrary, loadLeaflet, removeLeafletMap } from "@/features/map/leaflet/library";

type Internals = { _animatingZoom: boolean; _onZoomTransitionEnd(): void; touchZoom: { _zooming: boolean; _animRequest?: number } };

let library: LeafletLibrary;
let container: HTMLElement;

beforeAll(async () => {
  library = await loadLeaflet();
});

afterEach(() => {
  container.remove();
  vi.useRealTimers();
});

function mount(): LMap {
  container = document.createElement("div");
  document.body.append(container);
  return library.L.map(container, { center: [41.31, 69.28], zoom: 12, zoomControl: false, attributionControl: false });
}

describe("removeLeafletMap (WP-28)", () => {
  it("a zoom animation's end timer after the removal does nothing (Leaflet 1.9.4 would read the deleted pane)", () => {
    const map = mount();
    const internals = map as unknown as Internals;
    internals._animatingZoom = true;

    removeLeafletMap(map);

    expect(() => internals._onZoomTransitionEnd()).not.toThrow();
  });

  it("a pinch under way stops: its next move does nothing on the removed map", () => {
    const map = mount();
    const internals = map as unknown as Internals;
    internals.touchZoom._zooming = true;

    removeLeafletMap(map);

    expect(internals.touchZoom._zooming).toBe(false);
  });

  it("a wheel zoom still waiting for its debounce does nothing after the removal (WP-28 review, round 2)", () => {
    vi.useFakeTimers();
    const map = mount();
    container.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, clientX: 200, clientY: 300, bubbles: true, cancelable: true }));

    removeLeafletMap(map);

    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
  });

  it("removes the map and its listeners, so the container takes a new map", () => {
    const map = mount();
    map.on("click", () => undefined);

    removeLeafletMap(map);

    expect(map.listens("click")).toBe(false);
    expect(() => library.L.map(container, { center: [41.31, 69.28], zoom: 12 }).remove()).not.toThrow();
  });
});
