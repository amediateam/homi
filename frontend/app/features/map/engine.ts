import { useEffect, useSyncExternalStore } from "react";

import { launchMapOptions } from "@/lib/deeplinks/launch";
import type { MapOverride } from "@/lib/deeplinks/parse";
import { reportError } from "@/lib/errors/report";
import { isLiteGraphics } from "@/lib/graphics";
import { storageGet, storageSet } from "@/lib/storage";

import { loadMapLibre } from "./gl/library";
import type { MapFailReason } from "./types";

/**
 * The map engine of a session (`03` §1.8, DEC-44): MapLibre GL is the main one, Leaflet (WP-28) the fallback. The
 * choice is made once per session and changes only after a GL failure (LB-APP-019).
 */
export type Engine = "gl" | "leaflet";

export type EngineInput = {
  /** `?map=` of the launch (TMA-012). */
  override: MapOverride | null;
  /** `homi-map-engine`. */
  saved: Engine | null;
  /** A WebGL2 context can be created: MapLibre 6 needs WebGL2. */
  webgl2: boolean;
  /** A WebGL2 context with `failIfMajorPerformanceCaveat: true` can be created. */
  webgl2NoCaveat: boolean;
  lite: boolean;
  /** A GL failure happened in this session. */
  glFailed: boolean;
};

/** Row 1 of the table: `?map=gl|leaflet` becomes the saved choice, `?map=auto` forgets it. */
function savedAfter(override: MapOverride | null, saved: Engine | null): Engine | null {
  if (override === "auto") {
    return null;
  }
  return override ?? saved;
}

/**
 * The engine rule (WP-27 "Engine choice"): the launch override replaces the saved choice; a GL failure of this
 * session means Leaflet; saved `leaflet` is Leaflet; saved `gl` is GL when WebGL2 works; nothing saved is GL when
 * WebGL2 works without a major performance caveat and lite mode is off. Pure.
 */
export function pickEngine({ override, saved, webgl2, webgl2NoCaveat, lite, glFailed }: EngineInput): Engine {
  const choice = savedAfter(override, saved);
  if (glFailed || choice === "leaflet") {
    return "leaflet";
  }
  if (choice === "gl") {
    return webgl2 ? "gl" : "leaflet";
  }
  return webgl2NoCaveat && !lite ? "gl" : "leaflet";
}

/** One probe on its own canvas (a second `getContext` would return the first context), released at once. */
function probeWebGL2(failIfMajorPerformanceCaveat: boolean): boolean {
  try {
    const context = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat });
    if (!context) {
      return false;
    }
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function storedEngine(): Engine | null {
  const stored = storageGet("homi-map-engine");
  return stored === "gl" || stored === "leaflet" ? stored : null;
}

function liteNow(): boolean {
  return document.documentElement.classList.contains("lite") || isLiteGraphics();
}

let engine: Engine | null = null;
let glFailed = false;
let failureReported = false;
let warming: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** The browser's inputs, probing only what the rule needs: none after a failure or for saved `leaflet`. */
function readInput(): EngineInput {
  const { override } = launchMapOptions();
  if (override !== null) {
    storageSet("homi-map-engine", override === "auto" ? null : override);
  }
  const saved = storedEngine();
  const choice = savedAfter(override, saved);
  const lite = liteNow();
  return {
    override,
    saved,
    webgl2: !glFailed && choice === "gl" && probeWebGL2(false),
    webgl2NoCaveat: !glFailed && choice === null && !lite && probeWebGL2(true),
    lite,
    glFailed,
  };
}

/**
 * The engine of this session: computed on the first call in the browser (the launch override is written to
 * `homi-map-engine` then, once), the same value afterwards, `"leaflet"` after `markGlFailed`. Outside the browser it
 * answers `"leaflet"` without remembering it.
 */
export function currentEngine(): Engine {
  if (engine !== null) {
    return engine;
  }
  if (typeof document === "undefined") {
    return "leaflet";
  }
  engine = pickEngine(readInput());
  return engine;
}

/**
 * The GL view failed (`onFail`): the rest of the session uses Leaflet, and `map_gl_failed` is reported once
 * (LB-APP-019). The next map open goes straight to the fallback.
 */
export function markGlFailed(reason: MapFailReason): void {
  glFailed = true;
  if (!failureReported) {
    failureReported = true;
    reportError(new Error("map_gl_failed"), { kind: "error", reason });
  }
  if (engine !== "leaflet") {
    engine = "leaflet";
    notify();
  }
}

export function subscribeEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function engineSnapshot(): Engine | null {
  return engine;
}

function serverEngine(): null {
  return null;
}

/**
 * The session's engine for a Client Component: `null` on the server and until the first client read, which this
 * hook makes in an effect when nothing has read it yet (`MapWarmup` usually has), so rendering never probes WebGL or
 * writes the launch override.
 */
export function useEngine(): Engine | null {
  const value = useSyncExternalStore(subscribeEngine, engineSnapshot, serverEngine);
  useEffect(() => {
    if (engine === null) {
      currentEngine();
      notify();
    }
  }, []);
  return value;
}

/**
 * Loads the code of an engine ahead of the map (LB-APP-018): for GL the view chunk and `maplibre-gl` with `pmtiles`;
 * Leaflet has nothing to load until WP-28. Single-flight; a rejection is passed on and forgotten, so the next call
 * retries. Called from an effect, an idle callback or a pointer event, never while rendering; a caller that does not
 * wait catches the rejection.
 */
export function warmMap(target: Engine = currentEngine()): Promise<void> {
  if (target === "leaflet") {
    return Promise.resolve();
  }
  warming ??= Promise.all([import("./gl/MapViewGL"), loadMapLibre()])
    .then(() => undefined)
    .catch((error: unknown) => {
      warming = null;
      throw error;
    });
  return warming;
}

/** Forgets the session's engine, failure, report and warm-up; tests only. */
export function resetEngineForTests(): void {
  engine = null;
  glFailed = false;
  failureReported = false;
  warming = null;
}
