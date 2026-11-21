import { act, cleanup, renderHook } from "@testing-library/react";
import type { Map as LMap } from "leaflet";
import { useCallback, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { type LeafletLibrary, loadLeaflet } from "@/features/map/leaflet/library";
import { createListingLayer, useListingLayer } from "@/features/map/leaflet/listingLayer";
import { LEAFLET_MAX_ZOOM, type LeafletHandle } from "@/features/map/leaflet/useLeafletMap";
import { useSpiderfy } from "@/features/map/leaflet/useSpiderfy";
import { spreadStackLabels } from "@/features/map/pins";
import type { MapGroup, MapPoint, Selection } from "@/features/map/types";

vi.mock("@/lib/telegram", () => ({ tg: { haptic: { impact: () => undefined } } }));

function point(number: number, lat: number, lon: number, label = `$${number}`): MapPoint {
  return { number, origin: "legacy", lat, lon, label, tone: null, priced: true, usd: number };
}

function group(lat: number, lon: number, numbers: number[]): MapGroup {
  return { key: `${lat.toFixed(5)},${lon.toFixed(5)}`, lat, lon, items: numbers.map((number) => point(number, lat, lon)) };
}

let library: LeafletLibrary;
let map: LMap;
let container: HTMLElement;

beforeAll(async () => {
  library = await loadLeaflet();
});

afterEach(() => {
  cleanup();
  map.remove();
  container.remove();
});

/** A real Leaflet map in a 400 × 800 container (jsdom lays nothing out, so the size is given). */
function mount(center: [number, number], zoom: number): LeafletHandle {
  container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 400 });
  Object.defineProperty(container, "clientHeight", { value: 800 });
  document.body.append(container);
  map = library.L.map(container, { center, zoom, maxZoom: LEAFLET_MAX_ZOOM, zoomControl: false, attributionControl: false });
  return { mapRef: { current: { map, ...library } }, generation: 1 };
}

/** The view's wiring: the selection is the screen's state, the spread is the hook's. */
function useView(handle: LeafletHandle, groups: MapGroup[], onSelect: (numbers: number[], at?: number) => void) {
  const [selection, setSelection] = useState<Selection>(null);
  const select = useCallback(
    (numbers: number[], at = 0) => {
      onSelect(numbers, at);
      setSelection({ numbers, at });
    },
    [onSelect],
  );
  const spiderfy = useSpiderfy(handle, groups, selection);
  useListingLayer(handle, { groups, selection, onSelect: select, spiderfy });
  return { selection, spread: spiderfy.spread, close: () => setSelection(null) };
}

function tap(element: Element | null): void {
  expect(element).not.toBeNull();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const markers = (kind: string) => container.querySelectorAll(`[data-marker="${kind}"]`);

const STACK = group(41.3111, 69.2797, [11, 12, 13]);
const PIN = group(41.315, 69.285, [21]);

describe("useSpiderfy (WP-28 'Listings layer', SCR-011)", () => {
  it("spreads a tapped stack into labelled pins around its dot, out of the clusters, and selects it at index 0", () => {
    const onSelect = vi.fn();
    const handle = mount([41.31, 69.28], 15);
    const { result } = renderHook(() => useView(handle, [STACK, PIN], onSelect));

    tap(container.querySelector('[data-marker="stack"]'));

    expect(onSelect).toHaveBeenCalledWith([11, 12, 13], 0);
    expect(result.current.spread).toBe(STACK);
    expect(markers("stack")).toHaveLength(0);
    expect(markers("dot")).toHaveLength(1);
    const spread = [...markers("spread")] as HTMLElement[];
    expect(spread.map((element) => element.textContent)).toEqual(["$11", "$12", "$13"]);
    // No layout in jsdom: the offsets are those of the default label box.
    const offsets = spreadStackLabels(STACK);
    spread.forEach((element, at) => {
      const root = element.parentElement as HTMLElement;
      expect(root.style.marginLeft).toBe(`${offsets[at].dx}px`);
      expect(root.style.marginTop).toBe(`${offsets[at].dy}px`);
    });
    expect(markers("pin")).toHaveLength(1);
  });

  it("keeps the stack spread while a spread pin moves the index, and marks that pin active", () => {
    const onSelect = vi.fn();
    const handle = mount([41.31, 69.28], 15);
    const { result } = renderHook(() => useView(handle, [STACK, PIN], onSelect));
    tap(container.querySelector('[data-marker="stack"]'));

    tap(markers("spread")[2]);

    expect(onSelect).toHaveBeenLastCalledWith([11, 12, 13], 2);
    expect(result.current.spread).toBe(STACK);
    expect([...markers("spread")].map((element) => element.classList.contains("active"))).toEqual([false, false, true]);
  });

  it("collapses the stack when a zoom starts; the selection stays", () => {
    const handle = mount([41.31, 69.28], 15);
    const { result } = renderHook(() => useView(handle, [STACK, PIN], vi.fn()));
    tap(container.querySelector('[data-marker="stack"]'));

    act(() => {
      map.setZoom(16);
    });

    expect(result.current.spread).toBeNull();
    expect(result.current.selection).toEqual({ numbers: [11, 12, 13], at: 0 });
    expect(markers("spread")).toHaveLength(0);
    expect(markers("dot")).toHaveLength(0);
    const stack = container.querySelector('[data-marker="stack"]');
    expect(stack?.classList.contains("active")).toBe(true);
  });

  it("collapses the stack when another pin is selected or the card closes", () => {
    const handle = mount([41.31, 69.28], 15);
    const { result } = renderHook(() => useView(handle, [STACK, PIN], vi.fn()));
    tap(container.querySelector('[data-marker="stack"]'));

    tap(container.querySelector('[data-marker="pin"]'));
    expect(result.current.spread).toBeNull();
    expect(markers("spread")).toHaveLength(0);

    tap(container.querySelector('[data-marker="stack"]'));
    expect(markers("spread")).toHaveLength(3);
    act(() => result.current.close());
    expect(markers("spread")).toHaveLength(0);
    expect(markers("stack")).toHaveLength(1);
  });

  it("collapses any spread stack before a cluster tap is handled (LB-APP-013)", () => {
    // At the maximum zoom: a stack, and two listings 5 px apart that cluster.
    mount([41.3111, 69.28], LEAFLET_MAX_ZOOM);
    const stack = group(41.3111, 69.28, [11, 12, 13]);
    const pair = [group(41.3111, 69.2805, [31]), group(41.3111, 69.28053, [32])];
    const calls: string[] = [];
    const layer = createListingLayer(
      { map, ...library },
      {
        select: (numbers) => calls.push(`select ${numbers.join(",")}`),
        spread: (spreadGroup) => calls.push(`spread ${spreadGroup.key}`),
        collapse: () => calls.push("collapse"),
      },
    );
    layer.update({ groups: [stack, ...pair], spread: stack, active: 11 });
    expect(markers("spread")).toHaveLength(3);

    tap(container.querySelector('[data-marker="cluster"]'));

    expect(calls[0]).toBe("collapse");
    expect(calls[1]).toMatch(/^select (31,32|32,31)$/);
    layer.update({ groups: [stack, ...pair], spread: null, active: 31 });
    expect(markers("spread")).toHaveLength(0);
    layer.destroy();
  });

  it("collapses before a cluster tap below the maximum zoom, then zooms in", () => {
    mount([41.3111, 69.28], 14);
    const calls: string[] = [];
    const layer = createListingLayer(
      { map, ...library },
      {
        select: () => calls.push("select"),
        spread: () => calls.push("spread"),
        collapse: () => calls.push("collapse"),
      },
    );
    map.on("zoomstart", () => calls.push("zoomstart"));
    layer.update({ groups: [group(41.3111, 69.28, [31]), group(41.3111, 69.2802, [32])], spread: null, active: null });

    tap(container.querySelector('[data-marker="cluster"]'));

    expect(calls.slice(0, 2)).toEqual(["collapse", "zoomstart"]);
    expect(calls).not.toContain("select");
    expect(map.getZoom()).toBeGreaterThan(14);
    layer.destroy();
  });
});
