import type { Map as LMap } from "leaflet";
import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { type LeafletLibrary, loadLeaflet } from "@/features/map/leaflet/library";
import {
  ACTIVE_Z_OFFSET,
  createListingLayer,
  type ListingCallbacks,
  type ListingLayer,
  SPREAD_Z_OFFSET,
} from "@/features/map/leaflet/listingLayer";
import { LEAFLET_MAX_ZOOM } from "@/features/map/leaflet/useLeafletMap";
import type { MapGroup, MapPoint } from "@/features/map/types";

const state = vi.hoisted(() => ({ impact: vi.fn() }));
vi.mock("@/lib/telegram", () => ({ tg: { haptic: { impact: () => state.impact() } } }));

function point(number: number, lat: number, lon: number, label = `$${number}`): MapPoint {
  return { number, lat, lon, label, tone: null, priced: true, usd: number };
}

function group(lat: number, lon: number, numbers: number[], label?: string): MapGroup {
  return { key: `${lat.toFixed(5)},${lon.toFixed(5)}`, lat, lon, items: numbers.map((number) => point(number, lat, lon, label)) };
}

let library: LeafletLibrary;
let map: LMap;
let container: HTMLElement;
let layer: ListingLayer;
let callbacks: { select: Mock<ListingCallbacks["select"]>; spread: Mock<ListingCallbacks["spread"]>; collapse: Mock<() => void> };
let background: Mock<() => void>;

beforeAll(async () => {
  library = await loadLeaflet();
});

function mount(center: [number, number], zoom: number): void {
  container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 400 });
  Object.defineProperty(container, "clientHeight", { value: 800 });
  document.body.append(container);
  map = library.L.map(container, { center, zoom, maxZoom: LEAFLET_MAX_ZOOM, zoomControl: false, attributionControl: false });
  background = vi.fn();
  map.on("click", () => background());
  callbacks = { select: vi.fn(), spread: vi.fn(), collapse: vi.fn() };
  layer = createListingLayer({ map, ...library }, callbacks);
}

beforeEach(() => {
  state.impact.mockReset();
});

afterEach(() => {
  layer.destroy();
  map.remove();
  container.remove();
});

function tap(element: Element | null): void {
  expect(element).not.toBeNull();
  element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

const all = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)];

/** The Leaflet root around a marker element: its z-index is Leaflet's (screen `y` plus the offset). */
function zOf(element: Element): number {
  return Number((element.parentElement as HTMLElement).style.zIndex);
}

describe("createListingLayer (WP-28 'Listings layer', SCR-011)", () => {
  it("counts listings in a cluster: a stack of three and a pin make 4, not 2", () => {
    mount([41.3111, 69.28], 12);
    layer.update({ groups: [group(41.3111, 69.28, [1, 2, 3]), group(41.3112, 69.2801, [4])], spread: null, active: null });

    expect(all('[data-marker="cluster"]').map((cluster) => cluster.textContent)).toEqual(["4"]);
    expect(all('[data-marker="pin"], [data-marker="stack"]')).toHaveLength(0);
  });

  it("selects a pin's listing and spreads and selects a stack at 0, without a background tap", () => {
    mount([41.31, 69.28], 15);
    const stack = group(41.3111, 69.2797, [11, 12]);
    layer.update({ groups: [stack, group(41.315, 69.285, [21])], spread: null, active: null });

    tap(container.querySelector('[data-marker="pin"]'));
    tap(container.querySelector('[data-marker="stack"]'));

    expect(callbacks.select.mock.calls).toEqual([[[21]], [[11, 12], 0]]);
    expect(callbacks.spread).toHaveBeenCalledWith(stack);
    expect(background).not.toHaveBeenCalled();
    expect(state.impact).not.toHaveBeenCalled();
  });

  it("plays a light haptic and zooms in on a cluster tap below the maximum zoom", () => {
    mount([41.3111, 69.28], 13);
    layer.update({ groups: [group(41.3111, 69.28, [31]), group(41.3111, 69.2803, [32])], spread: null, active: null });

    tap(container.querySelector('[data-marker="cluster"]'));

    expect(state.impact).toHaveBeenCalledTimes(1);
    expect(map.getZoom()).toBeGreaterThan(13);
    expect(callbacks.select).not.toHaveBeenCalled();
    expect(background).not.toHaveBeenCalled();
  });

  it("selects every listing of a cluster at the maximum zoom, stacks included, without zooming", () => {
    mount([41.3111, 69.28], LEAFLET_MAX_ZOOM);
    layer.update({ groups: [group(41.3111, 69.28, [41, 42]), group(41.3111, 69.28003, [43])], spread: null, active: null });

    tap(container.querySelector('[data-marker="cluster"]'));

    expect(callbacks.select).toHaveBeenCalledTimes(1);
    expect([...callbacks.select.mock.calls[0][0]].sort()).toEqual([41, 42, 43]);
    expect(map.getZoom()).toBe(LEAFLET_MAX_ZOOM);
    expect(state.impact).not.toHaveBeenCalled();
  });

  it("marks the active listing's marker and raises it through Leaflet's z-index offset", () => {
    mount([41.31, 69.28], 15);
    const groups = [group(41.3111, 69.2797, [11, 12]), group(41.315, 69.285, [21])];
    layer.update({ groups, spread: null, active: 12 });

    const stack = container.querySelector('[data-marker="stack"]') as HTMLElement;
    const pin = container.querySelector('[data-marker="pin"]') as HTMLElement;
    expect(stack.classList.contains("active")).toBe(true);
    expect(pin.classList.contains("active")).toBe(false);
    expect(zOf(stack)).toBeGreaterThanOrEqual(ACTIVE_Z_OFFSET - 2000);
    expect(zOf(pin)).toBeLessThan(SPREAD_Z_OFFSET);

    layer.update({ groups, spread: null, active: 21 });
    expect(stack.classList.contains("active")).toBe(false);
    expect(pin.classList.contains("active")).toBe(true);
    expect(zOf(stack)).toBeLessThan(SPREAD_Z_OFFSET);
    expect(zOf(pin)).toBeGreaterThanOrEqual(ACTIVE_Z_OFFSET - 2000);
  });

  it("draws a spread stack above the other markers, its selected pin above everything", () => {
    mount([41.31, 69.28], 15);
    const stack = group(41.3111, 69.2797, [11, 12]);
    layer.update({ groups: [stack, group(41.315, 69.285, [21])], spread: stack, active: 12 });

    const [first, second] = all('[data-marker="spread"]');
    const pin = container.querySelector('[data-marker="pin"]') as HTMLElement;
    expect(zOf(first)).toBeGreaterThanOrEqual(SPREAD_Z_OFFSET - 2000);
    expect(zOf(first)).toBeLessThan(ACTIVE_Z_OFFSET - 2000);
    expect(zOf(second)).toBeGreaterThanOrEqual(ACTIVE_Z_OFFSET - 2000);
    expect(zOf(pin)).toBeLessThan(SPREAD_Z_OFFSET - 2000);
    // The dot is not a target: a tap on it is a tap on the map.
    const dot = container.querySelector('[data-marker="dot"]');
    expect(dot?.parentElement?.classList.contains("leaflet-interactive")).toBe(false);
    expect(first.parentElement?.classList.contains("leaflet-interactive")).toBe(true);
    tap(dot);
    expect(background).toHaveBeenCalledTimes(1);
  });

  it("draws a spread stack anew when any of its labels changes", () => {
    mount([41.31, 69.28], 15);
    const stack = group(41.3111, 69.2797, [11, 12]);
    layer.update({ groups: [stack], spread: stack, active: null });
    const repriced: MapGroup = { ...stack, items: [stack.items[0], { ...stack.items[1], label: "$99" }] };

    layer.update({ groups: [repriced], spread: repriced, active: null });

    expect(all('[data-marker="spread"]').map((element) => element.textContent)).toEqual(["$11", "$99"]);
  });

  it("keeps a marker whose content stays the same and replaces one whose content changed", () => {
    mount([41.31, 69.28], 15);
    const kept = group(41.315, 69.285, [21]);
    layer.update({ groups: [kept, group(41.3111, 69.2797, [11], "$100")], spread: null, active: null });
    const [keptElement, changedElement] = ["21", "11"].map((number) => container.querySelector(`[data-number="${number}"]`));

    layer.update({ groups: [{ ...kept, items: [...kept.items] }, group(41.3111, 69.2797, [11], "$90")], spread: null, active: null });

    expect(container.querySelector('[data-number="21"]')).toBe(keptElement);
    expect(container.querySelector('[data-number="11"]')).not.toBe(changedElement);
    expect(container.querySelector('[data-number="11"]')?.textContent).toBe("$90");

    layer.update({ groups: [kept], spread: null, active: null });
    expect(container.querySelector('[data-number="11"]')).toBeNull();
  });

  it("replaces a pin when another listing with the same label takes its address: the tap selects the new one", () => {
    mount([41.31, 69.28], 15);
    layer.update({ groups: [group(41.3111, 69.2797, [100], "$400")], spread: null, active: null });
    const before = container.querySelector('[data-number="100"]');

    layer.update({ groups: [group(41.3111, 69.2797, [200], "$400")], spread: null, active: 200 });

    const pin = container.querySelector<HTMLElement>('[data-marker="pin"]');
    expect(pin).not.toBe(before);
    expect(pin?.dataset.number).toBe("200");
    expect(pin?.classList.contains("active")).toBe(true);
    tap(pin);
    expect(callbacks.select).toHaveBeenCalledWith([200]);
  });

  it("leaves no marker or listener on the map once destroyed", () => {
    mount([41.31, 69.28], 15);
    const stack = group(41.3111, 69.2797, [11, 12]);
    layer.update({ groups: [stack, group(41.315, 69.285, [21])], spread: stack, active: 11 });

    layer.destroy();

    expect(container.querySelectorAll(".leaflet-marker-icon")).toHaveLength(0);
    let layers = 0;
    map.eachLayer(() => {
      layers += 1;
    });
    expect(layers).toBe(0);
  });
});
