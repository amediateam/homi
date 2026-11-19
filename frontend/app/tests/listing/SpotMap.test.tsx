import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Spot } from "@/features/listing/spot/spotGeometry";
import type { SpotMap as SpotMapValue, SpotMapOptions } from "@/features/listing/spot/useSpotMap";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  impact: vi.fn(),
  /** Every render of the stub map: the spot and options it was given; `value` is what it answers. */
  spotMap: { calls: [] as { spot: Spot | null; options: SpotMapOptions }[], value: null as unknown as SpotMapValue },
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/lib/telegram", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/telegram")>();
  return { ...original, tg: { ...original.tg, haptic: { impact: state.impact, success: vi.fn(), error: vi.fn() } } };
});
vi.mock("@/features/listing/spot/useSpotMap", () => ({
  useSpotMap: (_ref: unknown, spot: Spot | null, options: SpotMapOptions) => {
    state.spotMap.calls.push({ spot, options });
    return { ...state.spotMap.value, status: spot === null ? "idle" : state.spotMap.value.status };
  },
}));

import { NEAR_MARGIN, SpotMap } from "@/features/listing/spot/SpotMap";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";

const SPOT: Spot = { lat: 41.36512, lon: 69.28431, radius: 500 };

/** A fake `IntersectionObserver`: jsdom has none. `intersect()` tells every connected observer its target is near. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  connected = true;
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.connected = false;
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
}

function intersect() {
  act(() => {
    for (const observer of FakeObserver.all.filter((item) => item.connected)) {
      const entries = [...observer.targets].map((target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry);
      observer.callback(entries, observer as unknown as IntersectionObserver);
    }
  });
}

beforeEach(() => {
  state.push.mockReset();
  state.impact.mockReset();
  state.spotMap.calls = [];
  state.spotMap.value = { status: "ready", basemap: { kind: "raster" }, showUser: vi.fn(), fitSpotAndUser: vi.fn() };
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  resetReference();
  vi.unstubAllGlobals();
});

/** The mini map inside the listing layer's scroller, as `ListingLayer` renders it. */
function mini() {
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <div data-slot="route-overlay">
        <SpotMap number={100001} spot={SPOT} />
      </div>
    </NextIntlClientProvider>,
  );
}

const box = () => document.querySelector<HTMLButtonElement>("button[data-spot-map]")!;
const lastMap = () => state.spotMap.calls.at(-1)!;

describe("SpotMap (03 SCR-018 block 9, WP-28)", () => {
  it("waits until the box is near the listing's visible part, watched with a 300 px margin on the listing's scroller", () => {
    feedReference({});
    mini();

    expect(lastMap().spot).toBeNull();
    expect(FakeObserver.all).toHaveLength(1);
    expect(FakeObserver.all[0].options).toEqual({ root: document.querySelector('[data-slot="route-overlay"]'), rootMargin: NEAR_MARGIN });
    expect(NEAR_MARGIN).toBe("300px");
  });

  it("mounts a static map of the spot once near and reference data is loaded", () => {
    feedReference({});
    mini();

    intersect();

    expect(lastMap()).toEqual({ spot: SPOT, options: { interactive: false, tiles: null, scheme: "light", locale: "ru", lite: false } });
    expect(FakeObserver.all[0].connected).toBe(false);
  });

  it("waits for reference data when near, and mounts when it arrives", () => {
    mini();
    intersect();
    expect(lastMap().spot).toBeNull();

    act(() => feedReference({ reference: { map: { tiles_url: "https://cdn.homi.loc/tiles/uz.pmtiles" } } }));

    expect(lastMap().spot).toEqual(SPOT);
    expect(lastMap().options.tiles).toBe("https://cdn.homi.loc/tiles/uz.pmtiles");
  });

  it("stays mounted once near", () => {
    feedReference({});
    const view = mini();
    intersect();

    view.rerender(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <div data-slot="route-overlay">
          <SpotMap number={100001} spot={SPOT} />
        </div>
      </NextIntlClientProvider>,
    );

    expect(lastMap().spot).toEqual(SPOT);
    expect(FakeObserver.all.filter((observer) => observer.connected)).toHaveLength(0);
  });

  it("shows the attribution over the box once the map is ready, outside the button", () => {
    feedReference({});
    mini();
    expect(document.querySelector("[data-map-attribution]")).toBeNull();

    intersect();

    const attribution = document.querySelector("[data-map-attribution]");
    expect(attribution?.textContent).toBe("© OpenStreetMap");
    expect(box().contains(attribution)).toBe(false);
    expect(box().querySelector("a")).toBeNull();
  });

  it("after both engines failed keeps the background, without attribution, and the tap still opens the fullscreen map", () => {
    state.spotMap.value = { ...state.spotMap.value, status: "failed" };
    feedReference({});
    mini();
    intersect();

    expect(box().dataset.spotStatus).toBe("failed");
    expect(box().className).toContain("bg-bg2");
    expect(document.querySelector("[data-map-attribution]")).toBeNull();

    fireEvent.click(box());
    expect(state.impact).toHaveBeenCalledExactlyOnceWith("light");
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/listing/100001/location");
  });

  it("never counts as near without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    feedReference({});
    mini();

    expect(lastMap().spot).toBeNull();
  });
});
