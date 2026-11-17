import { describe, expect, it } from "vitest";

import {
  clampPan,
  clampScale,
  CLOSE_DRAG_PX,
  closesOnRelease,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_PX,
  DOUBLE_TAP_SCALE,
  DRAG_FADE_PX,
  dragAxis,
  dragProgress,
  isDoubleTap,
  isTap,
  MAX_SCALE,
  PINCH_MIN_SCALE,
  pinchScale,
  settlePinch,
  SNAP_TO_ONE_BELOW,
  TAP_SLOP_PX,
  toggleZoom,
  zoomAround,
} from "@/features/listing/viewer/gestures";

/** A portrait slide; a photo of the same shape fills it, a 4:3 landscape photo is letterboxed to 400 × 300. */
const box = { width: 400, height: 800 };
const filling = { width: 800, height: 1600 };
const landscape = { width: 1600, height: 1200 };
const unknown = { width: 0, height: 0 };

describe("the legacy values of ZoomableImage", () => {
  it("are 4×, 0.8×, 1.05×, 2.5×, 300 ms, 30 px, 8 px, 110 px and 275 px", () => {
    expect([MAX_SCALE, PINCH_MIN_SCALE, SNAP_TO_ONE_BELOW, DOUBLE_TAP_SCALE]).toEqual([4, 0.8, 1.05, 2.5]);
    expect([DOUBLE_TAP_MS, DOUBLE_TAP_PX, TAP_SLOP_PX, CLOSE_DRAG_PX, DRAG_FADE_PX]).toEqual([300, 30, 8, 110, 275]);
  });
});

describe("zoom", () => {
  it("rests between 1× and 4×", () => {
    expect(clampScale(0.5)).toBe(1);
    expect(clampScale(1)).toBe(1);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(5)).toBe(4);
  });

  it("a pinch follows the change of the finger distance between 0.8× and 4×", () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 100, 50)).toBe(1);
    expect(pinchScale(1, 100, 50)).toBe(0.8);
    expect(pinchScale(2, 100, 400)).toBe(4);
    expect(pinchScale(1.5, 0, 50)).toBe(1.5);
  });

  it("a released pinch snaps back to 1× below 1.05×, else rests with its pan clamped", () => {
    expect(settlePinch({ scale: 1.04, x: 30, y: 30 }, box, filling)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(settlePinch({ scale: 0.8, x: -12, y: 4 }, box, filling)).toEqual({ scale: 1, x: 0, y: 0 });
    // 1.05× of a 400 px wide photo: 10 px to either side.
    expect(settlePinch({ scale: 1.05, x: 300, y: 0 }, box, filling)).toEqual({ scale: 1.05, x: 10, y: 0 });
    expect(settlePinch({ scale: 4, x: -50, y: 20 }, box, filling)).toEqual({ scale: 4, x: -50, y: 20 });
    expect(settlePinch({ scale: 4.6, x: 0, y: 0 }, box, filling).scale).toBe(4);
  });
});

describe("pan", () => {
  it("only beyond 1×", () => {
    expect(clampPan({ scale: 1, x: 40, y: -40 }, box, filling)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(clampPan({ scale: 0.9, x: 40, y: -40 }, box, filling)).toEqual({ scale: 0.9, x: 0, y: 0 });
  });

  it("is clamped to the photo at its zoom, so its edges never come inside the slide", () => {
    // 2× of a photo that fills the slide: 800 × 1600 drawn, 200 px and 400 px to spare.
    expect(clampPan({ scale: 2, x: 500, y: -900 }, box, filling)).toEqual({ scale: 2, x: 200, y: -400 });
    expect(clampPan({ scale: 2, x: -120, y: 300 }, box, filling)).toEqual({ scale: 2, x: -120, y: 300 });
  });

  it("a letterboxed photo pans only as far as its own edges (HOMI; legacy clamps to the slide)", () => {
    // 2× of 400 × 300: 800 × 600 drawn, narrower than the slide's height, so it stays centred vertically.
    expect(clampPan({ scale: 2, x: 500, y: 300 }, box, landscape)).toEqual({ scale: 2, x: 200, y: 0 });
    // 4×: 1600 × 1200, 200 px of height to spare.
    expect(clampPan({ scale: 4, x: -900, y: 300 }, box, landscape)).toEqual({ scale: 4, x: -600, y: 200 });
  });

  it("a photo whose size is not known yet is clamped to the slide", () => {
    expect(clampPan({ scale: 2, x: 500, y: -900 }, box, unknown)).toEqual({ scale: 2, x: 200, y: -400 });
  });
});

describe("zoomAround and toggleZoom", () => {
  it("keeps the point under the focus where it is", () => {
    const zoomed = zoomAround({ scale: 1, x: 0, y: 0 }, 2.5, { x: 100, y: -40 }, box, filling);
    expect(zoomed).toEqual({ scale: 2.5, x: -150, y: 60 });
    // The content point under the focus maps back to the focus.
    expect(zoomed.x + 2.5 * 100).toBe(100);

    const deeper = zoomAround({ scale: 2, x: -100, y: 0 }, 4, { x: 0, y: 0 }, box, filling);
    expect(deeper).toEqual({ scale: 4, x: -200, y: 0 });
  });

  it("then clamps the pan to the photo", () => {
    expect(zoomAround({ scale: 1, x: 0, y: 0 }, 2.5, { x: 0, y: 300 }, box, landscape)).toEqual({ scale: 2.5, x: 0, y: 0 });
    expect(zoomAround({ scale: 1, x: 0, y: 0 }, 2.5, { x: 200, y: 0 }, box, landscape)).toEqual({ scale: 2.5, x: -300, y: 0 });
  });

  it("a double tap zooms 1× → 2.5× around the tap, and a zoomed photo back to 1×", () => {
    expect(toggleZoom({ scale: 1, x: 0, y: 0 }, { x: 100, y: -40 }, box, filling)).toEqual({ scale: 2.5, x: -150, y: 60 });
    expect(toggleZoom({ scale: 1, x: 0, y: 0 }, { x: 0, y: 0 }, box, filling)).toEqual({ scale: 2.5, x: 0, y: 0 });
    expect(toggleZoom({ scale: 2, x: 50, y: -20 }, { x: 100, y: 100 }, box, filling)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(toggleZoom({ scale: 4, x: 0, y: 0 }, { x: 0, y: 0 }, box, filling)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("taps", () => {
  it("a touch that moved at most 8 px is a tap", () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(8, 0)).toBe(true);
    expect(isTap(0, -8)).toBe(true);
    expect(isTap(5.6, 5.6)).toBe(true);
    expect(isTap(6, 6)).toBe(false);
    expect(isTap(0, 8.01)).toBe(false);
  });

  it("a double tap at 1×: less than 300 ms and less than 30 px (strict)", () => {
    const first = { x: 0, y: 0, at: 1000 };
    expect(isDoubleTap(first, { x: 29, y: 0, at: 1299 }, false)).toBe(true);
    expect(isDoubleTap(first, { x: 0, y: 0, at: 1299 }, false)).toBe(true);
    expect(isDoubleTap(first, { x: 20, y: 21, at: 1100 }, false)).toBe(true);
    expect(isDoubleTap(first, { x: 30, y: 0, at: 1299 }, false)).toBe(false);
    expect(isDoubleTap(first, { x: 21, y: 22, at: 1100 }, false)).toBe(false);
    expect(isDoubleTap(first, { x: 0, y: 0, at: 1300 }, false)).toBe(false);
    expect(isDoubleTap(null, { x: 0, y: 0, at: 1100 }, false)).toBe(false);
  });

  it("while zoomed only the time counts", () => {
    const first = { x: 0, y: 0, at: 1000 };
    expect(isDoubleTap(first, { x: 200, y: 300, at: 1299 }, true)).toBe(true);
    expect(isDoubleTap(first, { x: 0, y: 0, at: 1300 }, true)).toBe(false);
  });

  it("a forgotten first tap (time reset to 0) starts again", () => {
    expect(isDoubleTap({ x: 0, y: 0, at: 0 }, { x: 0, y: 0, at: 1299 }, false)).toBe(false);
  });
});

describe("the swipe-down close at 1×", () => {
  it("decides its axis after 8 px: down and more vertical than sideways closes", () => {
    expect(dragAxis(0, 8)).toBeNull();
    expect(dragAxis(5, 5)).toBeNull();
    expect(dragAxis(3, 9)).toBe("close");
    expect(dragAxis(-4, 12)).toBe("close");
    expect(dragAxis(9, 3)).toBe("none");
    expect(dragAxis(6, 6)).toBe("none");
    expect(dragAxis(0, -9)).toBe("none");
  });

  it("fades the background over 275 px, downward only", () => {
    expect(dragProgress(0)).toBe(0);
    expect(dragProgress(137.5)).toBe(0.5);
    expect(dragProgress(275)).toBe(1);
    expect(dragProgress(400)).toBe(1);
    expect(dragProgress(-20)).toBe(0);
  });

  it("closes when released past 110 px, strictly", () => {
    expect(closesOnRelease(110)).toBe(false);
    expect(closesOnRelease(110.5)).toBe(true);
    expect(closesOnRelease(111)).toBe(true);
    expect(closesOnRelease(-200)).toBe(false);
  });
});
