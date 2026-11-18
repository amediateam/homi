import { beforeAll, describe, expect, it } from "vitest";

import { clusterIcon, elementIcon, groupIcon, ICON_CLASS, spreadDotIcon, spreadPinIcon } from "@/features/map/leaflet/icons";
import { type LeafletModule, loadLeaflet } from "@/features/map/leaflet/library";
import type { MapGroup, MapPoint } from "@/features/map/types";

function point(number: number, overrides: Partial<MapPoint> = {}): MapPoint {
  return { number, lat: 41.3111, lon: 69.2797, label: "$600", tone: null, priced: true, usd: 600, ...overrides };
}

function group(items: MapPoint[]): MapGroup {
  return { key: "41.31110,69.27970", lat: 41.3111, lon: 69.2797, items };
}

const MARKUP = '<b>x</b><img src=x onerror="alert(1)"> &amp;';

let L: LeafletModule;

beforeAll(async () => {
  ({ L } = await loadLeaflet());
});

/** The root Leaflet makes for an icon when its marker is added to the map. */
function rootOf(icon: { createIcon(old?: HTMLElement): HTMLElement }): HTMLElement {
  return icon.createIcon();
}

describe("Leaflet icons (WP-28, LB-APP-020)", () => {
  it("shows a label with markup literally on a pin, a stack and a spread pin", () => {
    const pin = rootOf(groupIcon(L, group([point(1, { label: MARKUP })])).icon);
    const stack = rootOf(groupIcon(L, group([point(1, { label: MARKUP }), point(2), point(3)])).icon);
    const spread = rootOf(spreadPinIcon(L, point(1, { label: MARKUP })).icon);

    for (const root of [pin, stack, spread]) {
      expect(root.querySelector("b, img")).toBeNull();
    }
    expect(pin.textContent).toBe(MARKUP);
    expect(stack.querySelector(".stack > span")?.textContent).toBe(MARKUP);
    expect(stack.querySelector(".pin-n")?.textContent).toBe("3");
    expect(spread.textContent).toBe(MARKUP);
    expect((spread.firstElementChild as HTMLElement).dataset.marker).toBe("spread");
  });

  it("puts the shared element itself in the empty `.homi-icon` box, with no size of its own", () => {
    const { icon, element } = groupIcon(L, group([point(7)]));
    const root = rootOf(icon);

    expect(root.className).toBe(`leaflet-marker-icon ${ICON_CLASS}`);
    expect(root.firstElementChild).toBe(element);
    expect(root.childElementCount).toBe(1);
    expect(root.style.width).toBe("");
    expect(root.style.marginLeft).toBe("");
    // A marker shown again (a cluster split, a zoom) gets a new root around the same element.
    expect(rootOf(icon).firstElementChild).toBe(element);
  });

  it.each(["good", "high", "suspicious", "check"])("carries the tone %s as a class", (tone) => {
    const { element } = groupIcon(L, group([point(1, { tone })]));

    expect([...element.classList]).toEqual(["pin", tone]);
  });

  it("draws a plain pin for an unknown tone, nego without a price, and the stack's cheapest tone", () => {
    expect([...groupIcon(L, group([point(1, { tone: "evil active" })])).element.classList]).toEqual(["pin"]);
    expect([...groupIcon(L, group([point(1, { priced: false, usd: null })])).element.classList]).toEqual(["pin", "nego"]);
    expect([...groupIcon(L, group([point(1, { tone: "good" }), point(2, { tone: "high" })])).element.classList]).toEqual([
      "pin",
      "good",
      "stack",
    ]);
  });

  it.each([
    [1, 32],
    [9, 32],
    [10, 38],
    [49, 38],
    [50, 44],
    [1200, 44],
  ])("draws a cluster of %i listings %i px wide, with the count as text", (count, size) => {
    const cluster = rootOf(clusterIcon(L, count)).firstElementChild as HTMLElement;

    expect(cluster.className).toBe("cluster");
    expect(cluster.style.width).toBe(`${size}px`);
    expect(cluster.style.height).toBe(`${size}px`);
    expect(cluster.textContent).toBe(String(count));
  });

  it("moves a spread pin by its offset through Leaflet's anchor: the empty box's margins", () => {
    const element = document.createElement("div");
    const root = rootOf(elementIcon(L, element, { dx: 36.5, dy: -21 }));

    expect(root.style.marginLeft).toBe("36.5px");
    expect(root.style.marginTop).toBe("-21px");
    expect(root.firstElementChild).toBe(element);
  });

  it("draws the spread stack's dot", () => {
    const dot = rootOf(spreadDotIcon(L)).firstElementChild as HTMLElement;

    expect(dot.className).toBe("spread-dot");
    expect(dot.dataset.marker).toBe("dot");
  });
});
