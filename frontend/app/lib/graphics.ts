import { useSyncExternalStore } from "react";

import { currentProfile, type DeviceProfile, GRAPHICS_RULES, isAndroid, isLowEndDevice } from "@/lib/device";
import { storageGet, storageSet } from "@/lib/storage";

export { currentProfile, type DeviceProfile, GRAPHICS_RULES, isAndroid, isLowEndDevice, performanceClassOf } from "@/lib/device";

/**
 * Lite graphics (`03` §1.7). The choice is `homi-graphics` (`full` / `lite`, absent = auto), a measured result
 * `homi-graphics-measured` (`lite`). `html.lite` switches the CSS of `@homi/ui` (`lite.css`). The boot script
 * (`boot/boot.js`) repeats the auto rule in ES5 from the same constants before paint; a unit test compares both.
 * The device rule lives in `lib/device.ts`, which a Server Component can import, and is re-exported here.
 */

export type GraphicsMode = "auto" | "full" | "lite";

export function getGraphicsMode(): GraphicsMode {
  const stored = storageGet("homi-graphics");
  return stored === "full" || stored === "lite" ? stored : "auto";
}

export function isLiteGraphics(profile: DeviceProfile = currentProfile()): boolean {
  const mode = getGraphicsMode();
  if (mode !== "auto") {
    return mode === "lite";
  }
  return autoIsLite(profile);
}

/** What `auto` chooses on this device: lite once measured so, or on a weak device (the label «Авто · …», WP-31). */
export function autoIsLite(profile: DeviceProfile = currentProfile()): boolean {
  return storageGet("homi-graphics-measured") === "lite" || isLowEndDevice(profile);
}

const listeners = new Set<() => void>();

export function applyGraphicsMode(profile: DeviceProfile = currentProfile()): void {
  document.documentElement.classList.toggle("lite", isLiteGraphics(profile));
  for (const listener of listeners) {
    listener();
  }
}

/** `auto` also forgets the measured result. */
export function setGraphicsMode(mode: GraphicsMode): void {
  if (mode === "auto") {
    storageSet("homi-graphics", null);
    storageSet("homi-graphics-measured", null);
  } else {
    storageSet("homi-graphics", mode);
  }
  applyGraphicsMode();
}

/** Lite when at least 20 % of the intervals exceed 28 ms. */
export function judgeFrameIntervals(intervals: readonly number[]): boolean {
  const slow = intervals.filter((interval) => interval > GRAPHICS_RULES.slowFrameMs).length;
  return intervals.length > 0 && slow >= GRAPHICS_RULES.slowShare * intervals.length;
}

/**
 * Measures the next 150 frame intervals (Android in auto only, while lite is still off) and stores `lite` when
 * they are slow. The feed starts it on the first scroll (WP-24).
 */
export function measureScrollPerformance(profile: DeviceProfile = currentProfile()): Promise<"lite" | "full" | "skipped"> {
  if (!isAndroid(profile) || getGraphicsMode() !== "auto" || isLiteGraphics(profile)) {
    return Promise.resolve("skipped");
  }
  return new Promise((resolve) => {
    const stamps: number[] = [];
    const frame = (time: number): void => {
      stamps.push(time);
      if (stamps.length <= GRAPHICS_RULES.frameIntervals) {
        requestAnimationFrame(frame);
        return;
      }
      const intervals = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
      if (!judgeFrameIntervals(intervals)) {
        resolve("full");
        return;
      }
      storageSet("homi-graphics-measured", "lite");
      applyGraphicsMode(profile);
      resolve("lite");
    };
    requestAnimationFrame(frame);
  });
}

interface GraphicsSnapshot {
  mode: GraphicsMode;
  lite: boolean;
}

const serverSnapshot: GraphicsSnapshot = { mode: "auto", lite: false };
let cached: GraphicsSnapshot = serverSnapshot;

function snapshot(): GraphicsSnapshot {
  const mode = getGraphicsMode();
  const lite = document.documentElement.classList.contains("lite");
  if (cached.mode !== mode || cached.lite !== lite) {
    cached = { mode, lite };
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The stored mode and whether lite is on now, for the graphics setting (WP-31) and the map (WP-27). */
export function useGraphicsMode(): GraphicsSnapshot {
  return useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
}
