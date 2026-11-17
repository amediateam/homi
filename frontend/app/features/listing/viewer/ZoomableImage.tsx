"use client";

import { prefersReducedMotion } from "@homi/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { PhotoPlaceholder } from "@/features/feed/Photo";
import { tg } from "@/lib/telegram";

import {
  clampPan,
  closesOnRelease,
  dragAxis,
  dragProgress,
  isDoubleTap,
  isTap,
  pinchScale,
  type Point,
  settlePinch,
  type Size,
  type Tap,
  toggleZoom,
  type Transform,
} from "./gestures";

export interface ZoomableImageProps {
  src: string;
  /** The slide shown in the viewer; a zoomed slide that stops being shown is reset. */
  active: boolean;
  /** A zoom settled (a double tap, a pinch released): `true` while the photo is beyond 1×, which locks the strip. */
  onZoom: (zoomed: boolean) => void;
  /** The swipe-down close: 0 … 1 over the drag, 0 again when it springs back. */
  onDrag: (progress: number) => void;
  /** A swipe down released past the close distance, after the light haptic. */
  onClose: () => void;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

/** Every animated change (zoom, spring back, snap to 1×), legacy: 0.25 s on the iOS curve. */
const SETTLE = "transform 0.25s var(--ease-ios)";

/** One finger: where it went down and the zoom then; the drag direction once decided; whether it can still be a tap. */
interface OneFinger {
  kind: "one";
  startX: number;
  startY: number;
  start: Transform;
  axis: "close" | "none" | null;
  dx: number;
  dy: number;
  tap: boolean;
}

/** Two fingers: their distance and midpoint (relative to the centre) when the pinch began, and the zoom then. */
interface Pinch {
  kind: "pinch";
  startDist: number;
  startMid: Point;
  start: Transform;
}

type Gesture = { kind: "idle" } | OneFinger | Pinch;

type TouchPoint = Pick<Touch, "clientX" | "clientY">;

function distance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * One photo of the viewer (WP-26, SCR-020), zoomable by touch with the legacy gestures of `gestures.ts`: a pinch up to
 * 4× around the moving midpoint, snapped back to 1× below 1.05× on release; a double tap toggles 1× ↔ 2.5× around the
 * tap; a zoomed photo pans within the image; at 1× a downward drag moves the photo, fades the viewer through `onDrag`
 * and, released past 110 px, plays the light haptic and closes, else springs back. Touch only (legacy has no double
 * click); a sideways drag at 1× is the strip's. Every settle animates for 0.25 s, none while a finger moves and none
 * under reduced motion.
 *
 * The listeners are bound once, so `onZoom`, `onDrag` and `onClose` are read through a ref updated on every render
 * (fix of LB-APP-004). The transform lives in a ref and is written to the element, not rendered. The zoom goes back
 * to 1× at once, with `onZoom(false)`, when the slide stops being the shown one, on an orientation change and when
 * the slide is hidden (a cached route) or unmounted, so a photo shown again never keeps its zoom. A photo that fails
 * to load shows the placeholder.
 */
export function ZoomableImage({ src, active, onZoom, onDrag, onClose }: ZoomableImageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const view = useRef({ transform: IDENTITY, dragY: 0 });
  const [failed, setFailed] = useState(false);

  const handlers = useRef({ onZoom, onDrag, onClose });
  useLayoutEffect(() => {
    handlers.current = { onZoom, onDrag, onClose };
  });

  /** Writes the transform; `animate` settles it over 0.25 s (instant under reduced motion). */
  const apply = useCallback((animate: boolean) => {
    const layer = layerRef.current;
    const box = boxRef.current;
    const { transform, dragY } = view.current;
    if (layer !== null) {
      layer.style.transition = animate && !prefersReducedMotion() ? SETTLE : "none";
      layer.style.transform = `translate(${transform.x}px, ${transform.y + dragY}px) scale(${transform.scale})`;
    }
    if (box !== null) {
      // Zoomed, every move is the photo's; at 1× a sideways move scrolls the strip.
      box.style.touchAction = transform.scale > 1 ? "none" : "pan-x";
    }
  }, []);

  /** Back to 1× without animation; a zoomed photo tells the viewer, which unlocks the strip. */
  const reset = useCallback(() => {
    const { transform, dragY } = view.current;
    if (transform.scale === 1 && transform.x === 0 && transform.y === 0 && dragY === 0) {
      return;
    }
    view.current = { transform: IDENTITY, dragY: 0 };
    apply(false);
    if (dragY !== 0) {
      handlers.current.onDrag(0);
    }
    if (transform.scale !== 1) {
      handlers.current.onZoom(false);
    }
  }, [apply]);

  useLayoutEffect(() => {
    if (!active) {
      reset();
    }
  }, [active, reset]);

  // Hidden with a cached route, or unmounted: the photo shown again starts at 1×.
  useLayoutEffect(() => reset, [reset]);

  useEffect(() => {
    window.addEventListener("orientationchange", reset);
    return () => window.removeEventListener("orientationchange", reset);
  }, [reset]);

  useEffect(() => {
    const box = boxRef.current;
    if (box === null) {
      return undefined;
    }
    let gesture: Gesture = { kind: "idle" };
    let lastTap: Tap | null = null;

    const boxSize = (): Size => ({ width: box.clientWidth, height: box.clientHeight });
    const imageSize = (): Size => ({ width: imageRef.current?.naturalWidth ?? 0, height: imageRef.current?.naturalHeight ?? 0 });
    /** A point of the page relative to the centre of the slide, the frame of every transform. */
    const fromCentre = (x: number, y: number): Point => {
      const rect = box.getBoundingClientRect();
      return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
    };
    const setTransform = (transform: Transform, animate: boolean) => {
      view.current = { ...view.current, transform };
      apply(animate);
    };
    const settleZoom = (transform: Transform) => {
      setTransform(transform, true);
      handlers.current.onZoom(transform.scale > 1);
    };
    const startPinch = (a: TouchPoint, b: TouchPoint) => {
      const mid = fromCentre((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      if (gesture.kind === "one" && gesture.axis === "close") {
        view.current = { ...view.current, dragY: 0 };
        handlers.current.onDrag(0);
      }
      gesture = { kind: "pinch", startDist: distance(a, b), startMid: mid, start: view.current.transform };
      apply(false);
    };
    const startOne = (point: TouchPoint, tap: boolean) => {
      gesture = {
        kind: "one",
        startX: point.clientX,
        startY: point.clientY,
        start: view.current.transform,
        axis: view.current.transform.scale > 1 ? "none" : null,
        dx: 0,
        dy: 0,
        tap,
      };
      apply(false);
    };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        startPinch(event.touches[0], event.touches[1]);
      } else if (event.touches.length === 1) {
        startOne(event.touches[0], true);
      }
    };

    const onMove = (event: TouchEvent) => {
      if (gesture.kind === "pinch") {
        if (event.touches.length < 2) {
          return;
        }
        event.preventDefault();
        const [a, b] = [event.touches[0], event.touches[1]];
        const { start, startDist, startMid } = gesture;
        const scale = pinchScale(start.scale, startDist, distance(a, b));
        const mid = fromCentre((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        // The point under the fingers at the start follows their midpoint (legacy): not pan-clamped while pinching.
        setTransform(
          {
            scale,
            x: mid.x - ((startMid.x - start.x) * scale) / start.scale,
            y: mid.y - ((startMid.y - start.y) * scale) / start.scale,
          },
          false,
        );
        return;
      }
      if (gesture.kind !== "one" || event.touches.length !== 1) {
        return;
      }
      const point = event.touches[0];
      gesture.dx = point.clientX - gesture.startX;
      gesture.dy = point.clientY - gesture.startY;
      if (gesture.tap && !isTap(gesture.dx, gesture.dy)) {
        gesture.tap = false;
      }
      const { start } = gesture;
      if (start.scale > 1) {
        event.preventDefault();
        setTransform(clampPan({ scale: start.scale, x: start.x + gesture.dx, y: start.y + gesture.dy }, boxSize(), imageSize()), false);
        return;
      }
      gesture.axis ??= dragAxis(gesture.dx, gesture.dy);
      if (gesture.axis === "close") {
        event.preventDefault();
        view.current = { ...view.current, dragY: Math.max(0, gesture.dy) };
        apply(false);
        handlers.current.onDrag(dragProgress(gesture.dy));
      }
    };

    const springBack = () => {
      view.current = { ...view.current, dragY: 0 };
      apply(true);
      handlers.current.onDrag(0);
    };

    const onEnd = (event: TouchEvent) => {
      if (gesture.kind === "pinch") {
        if (event.touches.length >= 2) {
          return;
        }
        settleZoom(settlePinch(view.current.transform, boxSize(), imageSize()));
        lastTap = null;
        // The finger left after a pinch pans on (legacy); it never ends as a tap.
        if (event.touches.length === 1 && view.current.transform.scale > 1) {
          startOne(event.touches[0], false);
        } else {
          gesture = { kind: "idle" };
        }
        return;
      }
      if (gesture.kind !== "one" || event.touches.length > 0) {
        return;
      }
      const ended = gesture;
      gesture = { kind: "idle" };
      if (ended.axis === "close") {
        if (closesOnRelease(ended.dy)) {
          tg.haptic.impact("light");
          handlers.current.onClose();
        } else {
          springBack();
        }
        return;
      }
      const point = event.changedTouches[0];
      if (!ended.tap || point === undefined) {
        return;
      }
      const at = fromCentre(point.clientX, point.clientY);
      const tap: Tap = { x: at.x, y: at.y, at: Date.now() };
      const zoomed = view.current.transform.scale > 1;
      if (isDoubleTap(lastTap, tap, zoomed)) {
        lastTap = null;
        settleZoom(toggleZoom(view.current.transform, at, boxSize(), imageSize()));
      } else {
        lastTap = tap;
      }
    };

    const onCancel = () => {
      const ended = gesture;
      gesture = { kind: "idle" };
      if (ended.kind === "pinch") {
        settleZoom(settlePinch(view.current.transform, boxSize(), imageSize()));
      } else if (ended.kind === "one" && ended.axis === "close") {
        springBack();
      }
    };

    box.addEventListener("touchstart", onStart, { passive: true });
    box.addEventListener("touchmove", onMove, { passive: false });
    box.addEventListener("touchend", onEnd);
    box.addEventListener("touchcancel", onCancel);
    return () => {
      box.removeEventListener("touchstart", onStart);
      box.removeEventListener("touchmove", onMove);
      box.removeEventListener("touchend", onEnd);
      box.removeEventListener("touchcancel", onCancel);
    };
  }, [apply]);

  return (
    <div ref={boxRef} data-zoom="" className="relative size-full touch-pan-x overflow-hidden select-none">
      <div ref={layerRef} data-zoom-layer="" className="size-full will-change-transform">
        {failed ? (
          <PhotoPlaceholder />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- signed addresses must reach the browser unchanged.
          <img
            ref={imageRef}
            src={src}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setFailed(true)}
            className="block size-full object-contain"
          />
        )}
      </div>
    </div>
  );
}
