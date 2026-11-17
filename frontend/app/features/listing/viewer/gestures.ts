/**
 * The maths of the photo viewer's gestures (WP-26, SCR-020): pinch, pan, double tap and the swipe-down close, with
 * the legacy values of `ZoomableImage`. Pure: `ZoomableImage` feeds it touch points and box sizes and applies the
 * result as `translate(x, y) scale(scale)` with the origin at the centre of the slide, so every point here is relative
 * to that centre.
 */

/** The deepest zoom. */
export const MAX_SCALE = 4;
/** A pinch may shrink the photo this far while the fingers are down; it springs back on release. */
export const PINCH_MIN_SCALE = 0.8;
/** A pinch released below this snaps back to 1×. */
export const SNAP_TO_ONE_BELOW = 1.05;
/** The zoom of a double tap at 1×. */
export const DOUBLE_TAP_SCALE = 2.5;
/** The second tap counts within less than this … */
export const DOUBLE_TAP_MS = 300;
/** … and less than this far from the first (at 1× only). */
export const DOUBLE_TAP_PX = 30;
/** A touch that moved at most this far is a tap; beyond it a drag decides its direction. */
export const TAP_SLOP_PX = 8;
/** A downward drag at 1× past this closes the viewer. */
export const CLOSE_DRAG_PX = 110;
/** The drag that fades the background out completely (legacy: 2.5 × the close distance). */
export const DRAG_FADE_PX = CLOSE_DRAG_PX * 2.5;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** `translate(x, y) scale(scale)` around the centre of the slide. */
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

/** A single tap: where (any frame, the same for both taps) and when (ms). */
export interface Tap {
  x: number;
  y: number;
  at: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The resting zoom, after a gesture ends: 1× … 4×. */
export function clampScale(scale: number): number {
  return clamp(1, MAX_SCALE, scale);
}

/** The zoom while two fingers are down (legacy): the start zoom times the change of their distance, 0.8× … 4×. */
export function pinchScale(startScale: number, startDist: number, dist: number): number {
  if (startDist <= 0) {
    return clamp(PINCH_MIN_SCALE, MAX_SCALE, startScale);
  }
  return clamp(PINCH_MIN_SCALE, MAX_SCALE, (startScale * dist) / startDist);
}

/**
 * The photo as `object-fit: contain` draws it in the box at 1×. A size that is not known yet (an image still
 * loading) counts as the box.
 */
function containedSize(box: Size, image: Size): Size {
  if (image.width <= 0 || image.height <= 0) {
    return box;
  }
  const fit = Math.min(box.width / image.width, box.height / image.height);
  return { width: image.width * fit, height: image.height * fit };
}

/**
 * The pan of a zoomed photo, bounded by the contained image at its zoom, so its edges never come inside the box; a
 * side narrower than the box stays centred. At 1× and below there is no pan (HOMI, the spec's «clamped to the
 * image»: legacy bounds by the box, so a letterboxed photo pans past its edge).
 */
export function clampPan(t: Transform, box: Size, image: Size): Transform {
  if (t.scale <= 1) {
    return { scale: t.scale, x: 0, y: 0 };
  }
  const shown = containedSize(box, image);
  const bound = (spare: number, value: number) => (spare > 0 ? clamp(-spare, spare, value) : 0);
  return {
    scale: t.scale,
    x: bound((shown.width * t.scale - box.width) / 2, t.x),
    y: bound((shown.height * t.scale - box.height) / 2, t.y),
  };
}

/**
 * Zoom to `scale` keeping the point under `focus` (relative to the centre of the box) where it is, then clamp the
 * pan. A pinch in progress is not clamped (legacy): it follows the moving midpoint `m` itself, with
 * `x = m.x − (startMid.x − start.x) · scale / start.scale`.
 */
export function zoomAround(t: Transform, scale: number, focus: Point, box: Size, image: Size): Transform {
  const ratio = scale / t.scale;
  const moved = { scale, x: focus.x - (focus.x - t.x) * ratio, y: focus.y - (focus.y - t.y) * ratio };
  return clampPan(moved, box, image);
}

/** The settle of a released pinch (legacy): below 1.05× back to 1×, else the resting zoom with the pan clamped. */
export function settlePinch(t: Transform, box: Size, image: Size): Transform {
  if (t.scale < SNAP_TO_ONE_BELOW) {
    return { ...IDENTITY };
  }
  return clampPan({ ...t, scale: clampScale(t.scale) }, box, image);
}

/** A one-finger touch whose move stayed within 8 px. */
export function isTap(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= TAP_SLOP_PX;
}

/**
 * The second tap of a double tap (legacy, strict): within less than 300 ms and, at 1×, less than 30 px of the first.
 * While zoomed only the time counts, and that tap zooms back to 1×. After a double tap the caller forgets `prev`.
 */
export function isDoubleTap(prev: Tap | null, next: Tap, zoomed: boolean): boolean {
  if (prev === null || next.at - prev.at >= DOUBLE_TAP_MS) {
    return false;
  }
  return zoomed || Math.hypot(next.x - prev.x, next.y - prev.y) < DOUBLE_TAP_PX;
}

/** A double tap: 1× → 2.5× around the tap (relative to the centre of the box); zoomed → 1×. */
export function toggleZoom(t: Transform, focus: Point, box: Size, image: Size): Transform {
  if (t.scale > 1) {
    return { ...IDENTITY };
  }
  return zoomAround(IDENTITY, DOUBLE_TAP_SCALE, focus, box, image);
}

/**
 * The direction of a one-finger drag at 1× (legacy): undecided (`null`) within 8 px; then `"close"` when it goes down
 * more than sideways, else `"none"`. The caller decides once and keeps the answer until the finger lifts.
 */
export function dragAxis(dx: number, dy: number): "close" | "none" | null {
  if (Math.hypot(dx, dy) <= TAP_SLOP_PX) {
    return null;
  }
  return Math.abs(dy) > Math.abs(dx) && dy > 0 ? "close" : "none";
}

/** `--drag` of a close drag (legacy): 0 … 1 over 275 px, downward only. */
export function dragProgress(dy: number): number {
  return Math.min(1, Math.max(0, dy) / DRAG_FADE_PX);
}

/** A close drag released past 110 px (strictly) closes the viewer. */
export function closesOnRelease(dy: number): boolean {
  return dy > CLOSE_DRAG_PX;
}
