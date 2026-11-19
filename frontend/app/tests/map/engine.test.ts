import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentEngine,
  type Engine,
  type EngineInput,
  markGlFailed,
  pickEngine,
  resetEngineForTests,
  subscribeEngine,
  useEngine,
  warmMap,
} from "@/features/map/engine";
import type { LaunchMapOptions } from "@/lib/deeplinks/launch";
import type { MapOverride } from "@/lib/deeplinks/parse";
import { storageGet, storageSet } from "@/lib/storage";

const state = vi.hoisted(() => ({
  options: { override: null, debug: false } as LaunchMapOptions,
  loadMapLibre: vi.fn<() => Promise<unknown>>(),
  reportError: vi.fn(),
  viewLoaded: 0,
}));
vi.mock("@/lib/deeplinks/launch", () => ({ launchMapOptions: () => state.options }));
vi.mock("@/lib/errors/report", () => ({ reportError: state.reportError }));
vi.mock("@/features/map/gl/library", () => ({ loadMapLibre: state.loadMapLibre }));
vi.mock("@/features/map/gl/MapViewGL", () => {
  state.viewLoaded += 1;
  return { default: () => null };
});

/** The WebGL2 answers of the probes: without and with `failIfMajorPerformanceCaveat`. */
function webgl({ plain, noCaveat }: { plain: boolean; noCaveat: boolean }) {
  const loseContext = vi.fn();
  const context = { getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null) };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(((type: string, attributes?: WebGLContextAttributes) => {
      if (type !== "webgl2") {
        return null;
      }
      return (attributes?.failIfMajorPerformanceCaveat ? noCaveat : plain) ? context : null;
    }) as never);
  return { getContext, loseContext };
}

beforeEach(() => {
  resetEngineForTests();
  window.localStorage.clear();
  document.documentElement.classList.remove("lite");
  state.options = { override: null, debug: false };
  state.loadMapLibre.mockReset();
  state.reportError.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetEngineForTests();
  window.localStorage.clear();
  document.documentElement.classList.remove("lite");
});

describe("pickEngine (`03` §1.8, WP-27 \"Engine choice\")", () => {
  /** The five rows of the spec table, written out. */
  function expected({ override, saved, webgl2, webgl2NoCaveat, lite, glFailed }: EngineInput): Engine {
    let choice: Engine | null = saved;
    if (override === "gl" || override === "leaflet") {
      choice = override;
    } else if (override === "auto") {
      choice = null;
    }
    if (glFailed) {
      return "leaflet";
    }
    if (choice === "leaflet") {
      return "leaflet";
    }
    if (choice === "gl") {
      return webgl2 ? "gl" : "leaflet";
    }
    return webgl2NoCaveat && !lite ? "gl" : "leaflet";
  }

  it("follows the table for every override × saved × WebGL2 × caveat × lite × failure", () => {
    const overrides: (MapOverride | null)[] = [null, "gl", "leaflet", "auto"];
    const saves: (Engine | null)[] = [null, "gl", "leaflet"];
    const flags = [false, true];
    let cases = 0;
    for (const override of overrides) {
      for (const saved of saves) {
        for (const webgl2 of flags) {
          for (const webgl2NoCaveat of flags) {
            for (const lite of flags) {
              for (const glFailed of flags) {
                const input = { override, saved, webgl2, webgl2NoCaveat, lite, glFailed };
                expect(pickEngine(input), JSON.stringify(input)).toBe(expected(input));
                cases += 1;
              }
            }
          }
        }
      }
    }
    expect(cases).toBe(192);
  });

  const base: EngineInput = {
    override: null,
    saved: null,
    webgl2: true,
    webgl2NoCaveat: true,
    lite: false,
    glFailed: false,
  };

  it("row 1: ?map=gl|leaflet replaces the saved choice, ?map=auto forgets it", () => {
    expect(pickEngine({ ...base, override: "gl", saved: "leaflet", lite: true, webgl2NoCaveat: false })).toBe("gl");
    expect(pickEngine({ ...base, override: "leaflet", saved: "gl" })).toBe("leaflet");
    expect(pickEngine({ ...base, override: "auto", saved: "leaflet" })).toBe("gl");
    expect(pickEngine({ ...base, override: "auto", saved: "gl", lite: true })).toBe("leaflet");
  });

  it("row 2: a GL failure of this session wins over everything", () => {
    expect(pickEngine({ ...base, glFailed: true })).toBe("leaflet");
    expect(pickEngine({ ...base, glFailed: true, override: "gl", saved: "gl" })).toBe("leaflet");
  });

  it("row 3: saved leaflet is Leaflet on a capable device", () => {
    expect(pickEngine({ ...base, saved: "leaflet" })).toBe("leaflet");
  });

  it("row 4: saved gl needs WebGL2 only, whatever the caveat and lite mode", () => {
    expect(pickEngine({ ...base, saved: "gl", webgl2NoCaveat: false, lite: true })).toBe("gl");
    expect(pickEngine({ ...base, saved: "gl", webgl2: false })).toBe("leaflet");
  });

  it("row 5: nothing saved needs WebGL2 without the caveat and lite off", () => {
    expect(pickEngine(base)).toBe("gl");
    expect(pickEngine({ ...base, webgl2NoCaveat: false })).toBe("leaflet");
    expect(pickEngine({ ...base, lite: true })).toBe("leaflet");
  });
});

describe("currentEngine", () => {
  it("nothing saved: GL when the caveat probe passes and lite is off; the probe context is released", () => {
    const { getContext, loseContext } = webgl({ plain: true, noCaveat: true });
    expect(currentEngine()).toBe("gl");
    expect(getContext.mock.calls).toEqual([["webgl2", { failIfMajorPerformanceCaveat: true }]]);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("nothing saved: Leaflet when only a context with a performance caveat exists", () => {
    webgl({ plain: true, noCaveat: false });
    expect(currentEngine()).toBe("leaflet");
  });

  it("nothing saved: Leaflet in lite mode, from html.lite or the stored choice, without a probe", () => {
    const { getContext } = webgl({ plain: true, noCaveat: true });
    document.documentElement.classList.add("lite");
    expect(currentEngine()).toBe("leaflet");

    resetEngineForTests();
    document.documentElement.classList.remove("lite");
    storageSet("homi-graphics", "lite");
    expect(currentEngine()).toBe("leaflet");
    expect(getContext).not.toHaveBeenCalled();
  });

  it("saved gl: GL when WebGL2 exists without the caveat flag, also in lite mode", () => {
    const { getContext } = webgl({ plain: true, noCaveat: false });
    storageSet("homi-map-engine", "gl");
    document.documentElement.classList.add("lite");
    expect(currentEngine()).toBe("gl");
    expect(getContext.mock.calls).toEqual([["webgl2", { failIfMajorPerformanceCaveat: false }]]);
  });

  it("saved gl: Leaflet without WebGL2 (MapLibre 6 throws on WebGL1)", () => {
    webgl({ plain: false, noCaveat: false });
    storageSet("homi-map-engine", "gl");
    expect(currentEngine()).toBe("leaflet");
  });

  it("saved leaflet: Leaflet without a probe; an unknown saved value counts as nothing saved", () => {
    const { getContext } = webgl({ plain: true, noCaveat: true });
    storageSet("homi-map-engine", "leaflet");
    expect(currentEngine()).toBe("leaflet");
    expect(getContext).not.toHaveBeenCalled();

    resetEngineForTests();
    window.localStorage.setItem("homi-map-engine", "svg");
    expect(currentEngine()).toBe("gl");
  });

  it("?map=gl and ?map=leaflet are stored and decide; ?map=auto clears the key", () => {
    webgl({ plain: true, noCaveat: false });
    state.options = { override: "gl", debug: false };
    expect(currentEngine()).toBe("gl");
    expect(storageGet("homi-map-engine")).toBe("gl");

    resetEngineForTests();
    state.options = { override: "leaflet", debug: false };
    expect(currentEngine()).toBe("leaflet");
    expect(storageGet("homi-map-engine")).toBe("leaflet");

    resetEngineForTests();
    state.options = { override: "auto", debug: false };
    expect(currentEngine()).toBe("leaflet");
    expect(storageGet("homi-map-engine")).toBeNull();
  });

  it("an override decides even when the store refuses the write", () => {
    webgl({ plain: true, noCaveat: false });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    state.options = { override: "gl", debug: false };
    expect(currentEngine()).toBe("gl");
  });

  it("is computed once per session: later probes, stores and overrides change nothing", () => {
    const { getContext } = webgl({ plain: true, noCaveat: true });
    state.options = { override: "auto", debug: false };
    expect(currentEngine()).toBe("gl");

    storageSet("homi-map-engine", "leaflet");
    document.documentElement.classList.add("lite");
    getContext.mockReturnValue(null);
    expect(currentEngine()).toBe("gl");
    expect(currentEngine()).toBe("gl");
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(storageGet("homi-map-engine")).toBe("leaflet");
  });

  it("answers leaflet outside the browser without remembering it", () => {
    const { getContext } = webgl({ plain: true, noCaveat: true });
    vi.stubGlobal("document", undefined);
    expect(currentEngine()).toBe("leaflet");
    vi.unstubAllGlobals();
    expect(currentEngine()).toBe("gl");
    expect(getContext).toHaveBeenCalledTimes(1);
  });
});

describe("markGlFailed (LB-APP-019)", () => {
  it("switches the session to Leaflet, tells subscribers and reports map_gl_failed once", () => {
    webgl({ plain: true, noCaveat: true });
    expect(currentEngine()).toBe("gl");
    const listener = vi.fn();
    const unsubscribe = subscribeEngine(listener);

    markGlFailed("webgl");
    markGlFailed("chunk");

    expect(currentEngine()).toBe("leaflet");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(state.reportError).toHaveBeenCalledTimes(1);
    const [error, context] = state.reportError.mock.calls[0] as [Error, Record<string, unknown>];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("map_gl_failed");
    expect(context).toEqual({ kind: "error", reason: "webgl" });
    unsubscribe();
  });

  it("before any read, the session starts on Leaflet without probing", () => {
    const { getContext } = webgl({ plain: true, noCaveat: true });
    markGlFailed("style");
    expect(currentEngine()).toBe("leaflet");
    expect(getContext).not.toHaveBeenCalled();
  });

  it("an override of the launch does not bring GL back", () => {
    webgl({ plain: true, noCaveat: true });
    state.options = { override: "gl", debug: false };
    markGlFailed("webgl");
    expect(currentEngine()).toBe("leaflet");
  });
});

describe("useEngine", () => {
  function Probe({ seen }: { seen: (Engine | null)[] }) {
    const engine = useEngine();
    seen.push(engine);
    return createElement("span", null, engine ?? "none");
  }

  it("is null on the server, without probing", () => {
    const { getContext } = webgl({ plain: true, noCaveat: true });
    expect(renderToString(createElement(Probe, { seen: [] }))).toBe("<span>none</span>");
    expect(getContext).not.toHaveBeenCalled();
  });

  it("is null until the first client read, made in an effect, then the session's engine", () => {
    webgl({ plain: true, noCaveat: true });
    const seen: (Engine | null)[] = [];
    const view = render(createElement(Probe, { seen }));
    expect(seen[0]).toBeNull();
    expect(view.container.textContent).toBe("gl");
  });

  it("an engine already read renders at once, and a GL failure re-renders with Leaflet", () => {
    webgl({ plain: true, noCaveat: true });
    currentEngine();
    const seen: (Engine | null)[] = [];
    const view = render(createElement(Probe, { seen }));
    expect(seen[0]).toBe("gl");

    act(() => markGlFailed("webgl"));
    expect(view.container.textContent).toBe("leaflet");
  });
});

describe("warmMap (LB-APP-018)", () => {
  it("Leaflet has nothing to load yet", async () => {
    await expect(warmMap("leaflet")).resolves.toBeUndefined();
    expect(state.loadMapLibre).not.toHaveBeenCalled();
  });

  it("GL loads the view chunk and the library once for concurrent and later calls", async () => {
    state.loadMapLibre.mockResolvedValue({});
    const first = warmMap("gl");
    const second = warmMap("gl");
    expect(second).toBe(first);
    await expect(first).resolves.toBeUndefined();
    await warmMap("gl");

    expect(state.loadMapLibre).toHaveBeenCalledTimes(1);
    expect(state.viewLoaded).toBe(1);
  });

  it("a rejection is passed on and forgotten, so the next call retries", async () => {
    state.loadMapLibre.mockRejectedValueOnce(new Error("chunk failed")).mockResolvedValue({});
    const failed = warmMap("gl");
    expect(warmMap("gl")).toBe(failed);
    await expect(failed).rejects.toThrow("chunk failed");

    await expect(warmMap("gl")).resolves.toBeUndefined();
    expect(state.loadMapLibre).toHaveBeenCalledTimes(2);
  });

  it("without an argument warms the engine of the session", async () => {
    webgl({ plain: true, noCaveat: false });
    await warmMap();
    expect(state.loadMapLibre).not.toHaveBeenCalled();

    resetEngineForTests();
    webgl({ plain: true, noCaveat: true });
    state.loadMapLibre.mockResolvedValue({});
    await warmMap();
    expect(state.loadMapLibre).toHaveBeenCalledTimes(1);
  });
});
