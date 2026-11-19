import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapFailReason } from "@/features/map/types";

type Engine = "gl" | "leaflet";

/** One engine's stub: `load()` answers when the test settles it; every map it creates is recorded. */
interface StubEngine {
  loads: { resolve: () => void; reject: (error: unknown) => void }[];
  maps: { element: HTMLElement; input: SpotInput; onFail: (reason: MapFailReason) => void; instance: SpotInstance; removed: boolean }[];
  /** The next `create` fails while creating, with this reason. */
  failCreate: MapFailReason | null;
}

const state = vi.hoisted(() => ({
  engine: "gl" as "gl" | "leaflet",
  markGlFailed: vi.fn(),
  reportError: vi.fn(),
  engines: {} as Record<"gl" | "leaflet", StubEngine>,
}));

function stubEngine(name: Engine) {
  return {
    loadSpotEngine: () =>
      new Promise<SpotEngine>((resolve, reject) => {
        const engine = state.engines[name];
        engine.loads.push({
          resolve: () =>
            resolve({
              create(element, input, onFail) {
                if (engine.failCreate !== null) {
                  onFail(engine.failCreate);
                  return null;
                }
                const record = {
                  element,
                  input,
                  onFail,
                  removed: false,
                  instance: { showUser: vi.fn(), fit: vi.fn(), remove: vi.fn(() => (record.removed = true)) } as SpotInstance,
                };
                engine.maps.push(record);
                return record.instance;
              },
            }),
          reject,
        });
      }),
  };
}

vi.mock("@/features/map/engine", () => ({ currentEngine: () => state.engine, markGlFailed: state.markGlFailed }));
vi.mock("@/lib/errors/report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/errors/report")>()),
  reportError: state.reportError,
}));
vi.mock("@/features/listing/spot/spotGL", () => stubEngine("gl"));
vi.mock("@/features/listing/spot/spotLeaflet", () => stubEngine("leaflet"));

import type { Spot } from "@/features/listing/spot/spotGeometry";
import { type SpotEngine, type SpotInstance, type SpotInput, type SpotMapOptions, useSpotMap } from "@/features/listing/spot/useSpotMap";
import { resetBasemapForTests } from "@/features/map/useBasemap";

const SPOT: Spot = { lat: 41.36512, lon: 69.28431, radius: 500 };
const OPTIONS: SpotMapOptions = { interactive: false, tiles: null, scheme: "light", locale: "ru", lite: false };

let container: HTMLDivElement;

beforeEach(() => {
  state.engine = "gl";
  state.markGlFailed.mockReset();
  state.reportError.mockReset();
  resetBasemapForTests();
  state.engines = {
    gl: { loads: [], maps: [], failCreate: null },
    leaflet: { loads: [], maps: [], failCreate: null },
  };
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  cleanup();
  container.remove();
});

const live = (name: Engine) => state.engines[name].maps.filter((map) => !map.removed);
const allLive = () => [...live("gl"), ...live("leaflet")];

/** Lets the dynamic `import()` of a chunk and the promise chains after it run. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Settles every pending load of `name` (all runs so far), after their imports have answered. */
async function settle(name: Engine, outcome: "resolve" | "reject" = "resolve") {
  await flush();
  for (const load of state.engines[name].loads.splice(0)) {
    if (outcome === "resolve") {
      load.resolve();
    } else {
      load.reject(new Error("chunk"));
    }
  }
  await flush();
}

type Props = { spot: Spot | null; options: SpotMapOptions };

/** `strict`: StrictMode at the root, the only place React double-invokes the effects of a newly mounted tree. */
function mount(props: Props = { spot: SPOT, options: OPTIONS }, strict = false) {
  const ref = { current: container };
  return renderHook(({ spot, options }: Props) => useSpotMap(ref, spot, options), { initialProps: props, reactStrictMode: strict });
}

describe("useSpotMap (LB-APP-001: the only owner of the container)", () => {
  it("creates one map with the circle's input once the engine has loaded, and is ready", async () => {
    const { result } = mount();
    expect(result.current.status).toBe("loading");

    await settle("gl");

    expect(state.engines.gl.maps).toHaveLength(1);
    expect(state.engines.gl.maps[0].element).toBe(container);
    expect(state.engines.gl.maps[0].input).toEqual({
      interactive: false,
      basemap: { kind: "raster" },
      scheme: "light",
      locale: "ru",
      lite: false,
      spot: SPOT,
      user: null,
      onVectorError: expect.any(Function),
    });
    expect(result.current.status).toBe("ready");
  });

  it("StrictMode's double effect leaves one live instance", async () => {
    mount(undefined, true);

    await flush();
    // Both runs imported the chunk; the first was cleaned up before its import answered.
    expect(state.engines.gl.loads).toHaveLength(2);
    await settle("gl");

    expect(allLive()).toHaveLength(1);
    expect(state.engines.gl.maps).toHaveLength(1);
  });

  it("an unmount removes the map", async () => {
    const { unmount } = mount();
    await settle("gl");

    unmount();

    expect(state.engines.gl.maps[0].instance.remove).toHaveBeenCalledOnce();
    expect(allLive()).toHaveLength(0);
  });

  it("an unmount during the import creates nothing", async () => {
    const { unmount } = mount();
    unmount();

    await settle("gl");

    expect(state.engines.gl.maps).toHaveLength(0);
  });

  it("a new spot or a new theme removes the map before the next one is created", async () => {
    const { rerender } = mount();
    await settle("gl");

    rerender({ spot: SPOT, options: { ...OPTIONS, scheme: "dark" } });
    expect(state.engines.gl.maps[0].removed).toBe(true);
    await settle("gl");
    rerender({ spot: { ...SPOT, radius: 250 }, options: { ...OPTIONS, scheme: "dark" } });
    await settle("gl");

    expect(state.engines.gl.maps).toHaveLength(3);
    expect(allLive()).toEqual([state.engines.gl.maps[2]]);
    expect(state.engines.gl.maps[2].input).toMatchObject({ scheme: "dark", spot: { radius: 250 } });
  });

  it("an equal spot in a new object keeps the map", async () => {
    const { rerender } = mount();
    await settle("gl");

    rerender({ spot: { ...SPOT }, options: { ...OPTIONS } });

    expect(state.engines.gl.maps).toHaveLength(1);
    expect(allLive()).toHaveLength(1);
  });

  it("no spot creates nothing and is idle", async () => {
    const { result, rerender } = mount({ spot: null, options: OPTIONS });
    await flush();

    expect(result.current.status).toBe("idle");
    expect(state.engines.gl.loads).toHaveLength(0);
    expect(state.engines.gl.maps).toHaveLength(0);

    rerender({ spot: SPOT, options: OPTIONS });
    await settle("gl");
    expect(allLive()).toHaveLength(1);
  });

  it("uses Leaflet when the session's engine is Leaflet, without reporting a GL failure", async () => {
    state.engine = "leaflet";
    mount();

    await settle("leaflet");

    expect(state.engines.gl.loads).toHaveLength(0);
    expect(live("leaflet")).toHaveLength(1);
    expect(state.markGlFailed).not.toHaveBeenCalled();
  });
});

describe("useSpotMap basemap (WP-27 \"Basemap and tiles\", as the search map)", () => {
  const PMTILES = "https://cdn.homi.loc/tiles/uz.pmtiles";

  it("draws the basemap `tiles` asks for, and nothing but the background without reference data", async () => {
    const { result, rerender } = mount({ spot: SPOT, options: { ...OPTIONS, tiles: undefined } });
    await settle("gl");
    expect(state.engines.gl.maps[0].input.basemap).toEqual({ kind: "none" });

    rerender({ spot: SPOT, options: { ...OPTIONS, tiles: PMTILES } });
    await settle("gl");

    expect(state.engines.gl.maps[0].removed).toBe(true);
    expect(state.engines.gl.maps[1].input.basemap).toEqual({ kind: "pmtiles", url: PMTILES });
    expect(result.current.basemap).toEqual({ kind: "pmtiles", url: PMTILES });
  });

  it("a vector tile error re-creates the map on the raster, reported once for the session", async () => {
    const { result } = mount({ spot: SPOT, options: { ...OPTIONS, tiles: PMTILES } });
    await settle("gl");

    act(() => {
      state.engines.gl.maps[0].input.onVectorError();
      state.engines.gl.maps[0].input.onVectorError();
    });
    await settle("gl");

    expect(state.engines.gl.maps[0].removed).toBe(true);
    expect(state.engines.gl.maps[1].input.basemap).toEqual({ kind: "raster" });
    expect(result.current.basemap).toEqual({ kind: "raster" });
    expect(state.reportError).toHaveBeenCalledOnce();
    expect(state.markGlFailed).not.toHaveBeenCalled();
  });
});

describe("useSpotMap GL failures (LB-APP-019)", () => {
  it("a GL rejection marks GL failed once and continues with Leaflet in the same run", async () => {
    const { result } = mount();

    await settle("gl", "reject");
    expect(state.markGlFailed).toHaveBeenCalledExactlyOnceWith("chunk");
    expect(result.current.status).toBe("loading");
    await settle("leaflet");

    expect(state.engines.gl.maps).toHaveLength(0);
    expect(live("leaflet")).toHaveLength(1);
    expect(live("leaflet")[0].element).toBe(container);
    expect(result.current.status).toBe("ready");
  });

  it("a GL map that fails while being made falls back with its reason", async () => {
    state.engines.gl.failCreate = "webgl";
    mount();

    await settle("gl");
    await settle("leaflet");

    expect(state.markGlFailed).toHaveBeenCalledExactlyOnceWith("webgl");
    expect(live("leaflet")).toHaveLength(1);
  });

  it("a GL map that fails later is removed before the Leaflet map is created", async () => {
    mount();
    await settle("gl");
    const gl = state.engines.gl.maps[0];

    act(() => {
      gl.onFail("webgl");
      gl.onFail("chunk");
    });
    expect(gl.removed).toBe(true);
    await settle("leaflet");

    expect(state.markGlFailed).toHaveBeenCalledExactlyOnceWith("webgl");
    expect(allLive()).toEqual([state.engines.leaflet.maps[0]]);
  });

  it("an unmount during the GL import's fallback creates no Leaflet map", async () => {
    const { unmount } = mount();
    await settle("gl", "reject");

    unmount();
    await settle("leaflet");

    expect(state.engines.leaflet.maps).toHaveLength(0);
  });

  it("Leaflet failing too is failed, and creates nothing", async () => {
    const { result } = mount();

    await settle("gl", "reject");
    await settle("leaflet", "reject");

    expect(result.current.status).toBe("failed");
    expect(allLive()).toHaveLength(0);
    expect(state.markGlFailed).toHaveBeenCalledOnce();
  });
});

describe("useSpotMap user position (TMA-035: drawn, never sent)", () => {
  it("shows the user on the live map and fits the spot with the user", async () => {
    const { result } = mount({ spot: SPOT, options: { ...OPTIONS, interactive: true } });
    await settle("gl");
    const { instance } = state.engines.gl.maps[0];

    act(() => {
      result.current.showUser({ lat: 41.3, lon: 69.2 });
      result.current.fitSpotAndUser();
    });

    expect(instance.showUser).toHaveBeenCalledExactlyOnceWith({ lat: 41.3, lon: 69.2 });
    expect(instance.fit).toHaveBeenCalledExactlyOnceWith({ lat: 41.3, lon: 69.2 });
  });

  it("keeps a position shown before the map exists for the map created later", async () => {
    const { result, rerender } = mount();

    act(() => result.current.showUser({ lat: 41.3, lon: 69.2 }));
    await settle("gl");
    rerender({ spot: SPOT, options: { ...OPTIONS, scheme: "dark" } });
    await settle("gl");

    expect(state.engines.gl.maps.map((map) => map.input.user)).toEqual([
      { lat: 41.3, lon: 69.2 },
      { lat: 41.3, lon: 69.2 },
    ]);
  });

  it("does nothing without a map", () => {
    const { result } = mount();

    expect(() => act(() => result.current.fitSpotAndUser())).not.toThrow();
  });
});
