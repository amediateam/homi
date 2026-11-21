import { describe, expect, it } from "vitest";

import {
  clusterElement,
  clusterSize,
  pinElement,
  setActive,
  spreadDotElement,
  spreadPinElement,
  stackElement,
} from "@/features/map/markerElements";
import type { MapGroup, MapPoint } from "@/features/map/types";

function point(number: number, overrides: Partial<MapPoint> = {}): MapPoint {
  return { number, origin: "legacy", lat: 41.3111, lon: 69.2797, label: "$600", tone: null, priced: true, usd: 600, ...overrides };
}

function group(items: MapPoint[]): MapGroup {
  return { key: "41.31110,69.27970", lat: 41.3111, lon: 69.2797, items };
}

const MARKUP = "<b>x</b>";

describe("pinElement (SCR-011, LB-APP-020)", () => {
  it("draws the server label as text: markup creates no element", () => {
    const el = pinElement(point(100001, { label: MARKUP }));

    expect(el.textContent).toBe(MARKUP);
    expect(el.childElementCount).toBe(0);
    expect(el.querySelector("b")).toBeNull();
    expect(el.dataset.number).toBe("100001");
    expect([...el.classList]).toEqual(["pin"]);
  });

  it.each(["good", "high", "suspicious", "check"])("carries the tone %s as a class", (tone) => {
    expect([...pinElement(point(1, { tone })).classList]).toEqual(["pin", tone]);
  });

  it.each([null, "same", "pin active", ""])("draws a plain pin for the tone %j, and a tone with a space throws nothing", (tone) => {
    expect([...pinElement(point(1, { tone })).classList]).toEqual(["pin"]);
  });

  it("marks a listing without a price nego, and the selected one active", () => {
    expect(pinElement(point(1, { priced: false, usd: null, label: "Договорная" })).className).toBe("pin nego");
    expect(pinElement(point(1, { tone: "good" }), { active: true }).className).toBe("pin good active");
  });
});

describe("stackElement", () => {
  it("draws the cheapest label and the count as text, with the group key", () => {
    const el = stackElement(group([point(1, { label: MARKUP, tone: "high" }), point(2, { label: "$900" }), point(3)]));

    expect(el.className).toBe("pin high stack");
    expect(el.dataset.key).toBe("41.31110,69.27970");
    expect(el.querySelector("b")).toBeNull();
    const [label, badge] = [...el.children] as HTMLElement[];
    expect(el.childElementCount).toBe(2);
    expect(label.textContent).toBe(MARKUP);
    expect(label.childElementCount).toBe(0);
    expect(badge.className).toBe("pin-n");
    expect(badge.textContent).toBe("3");
  });

  it("takes nego from the cheapest listing and can be active", () => {
    const el = stackElement(group([point(1, { priced: false, usd: null }), point(2)]), { active: true });
    expect(el.className).toBe("pin nego active stack");
    expect(el.querySelector(".pin-n")?.textContent).toBe("2");
  });
});

describe("clusterElement", () => {
  it.each([
    [1, 32],
    [9, 32],
    [10, 38],
    [49, 38],
    [50, 44],
    [1200, 44],
  ])("%i listings: a %i px circle with the count", (count, size) => {
    const el = clusterElement(count);

    expect(clusterSize(count)).toBe(size);
    expect(el.className).toBe("cluster");
    expect(el.style.width).toBe(`${size}px`);
    expect(el.style.height).toBe(`${size}px`);
    expect(el.textContent).toBe(String(count));
    expect(el.dataset.count).toBe(String(count));
  });
});

describe("setActive and the spread dot", () => {
  it("toggles active on a pin or a stack and nothing else", () => {
    const el = pinElement(point(1, { tone: "check" }));
    setActive(el, true);
    expect(el.className).toBe("pin check active");
    setActive(el, true);
    expect(el.className).toBe("pin check active");
    setActive(el, false);
    expect(el.className).toBe("pin check");
  });

  it("the dot is an empty element of its own class", () => {
    const el = spreadDotElement();
    expect(el.className).toBe("spread-dot");
    expect(el.childNodes).toHaveLength(0);
  });
});

describe("test hooks", () => {
  it("names each kind in data-marker, and the count of a stack and a cluster in data-count", () => {
    const items = [point(1), point(2), point(3)];

    expect(pinElement(point(1)).dataset.marker).toBe("pin");
    expect(stackElement(group(items)).dataset).toMatchObject({ marker: "stack", key: "41.31110,69.27970", count: "3" });
    expect(clusterElement(12).dataset).toMatchObject({ marker: "cluster", count: "12" });
    expect(spreadDotElement().dataset.marker).toBe("dot");
  });

  it("a spread pin is a pin by its classes and text, a spread one by its data-marker", () => {
    const el = spreadPinElement(point(7, { label: MARKUP, tone: "good" }), { active: true });

    expect(el.dataset).toMatchObject({ marker: "spread", number: "7" });
    expect(el.className).toBe("pin good active");
    expect(el.textContent).toBe(MARKUP);
    expect(el.childElementCount).toBe(0);
  });
});
