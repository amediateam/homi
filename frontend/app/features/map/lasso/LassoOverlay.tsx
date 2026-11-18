"use client";

import type { Polygon } from "@homi/search";
import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

import { tg } from "@/lib/telegram";

import { LASSO_POINT_SPACING_PX, lassoToPolygon, type ScreenPoint } from "./polygon";

/**
 * What the lasso overlay asks of the engine below it (WP-28 "Lasso"), in the pixels of the map's container:
 * `gl/GlLasso.tsx` and `leaflet/lassoHandlers.ts` implement it. Each call takes effect at once, without animation.
 */
export type LassoHost = {
  /** The `[lat, lon]` under a point of the container. */
  unproject(x: number, y: number): readonly [lat: number, lon: number];
  /** Moves the map's content as a drag by `(dx, dy)` would: the content follows the fingers. */
  panBy(dx: number, dy: number): void;
  /** Zooms by `scale` around a point of the container: 2 is one zoom level in, 0.5 one out. */
  zoomAround(x: number, y: number, scale: number): void;
};

export type LassoOverlayProps = {
  host: LassoHost;
  onDrawn(polygon: Polygon): void;
  onTooSmall(): void;
};

type Box = { left: number; top: number; right: number; bottom: number };

type Pair = { x: number; y: number; distance: number };

type Gesture = {
  /** The pointer whose stroke is drawn; `null` when none is (not started, finished, or dropped by a second pointer). */
  drawer: number | null;
  stroke: ScreenPoint[];
  /** The pointers down on the overlay, at most two, where they are now. */
  pointers: Map<number, ScreenPoint>;
  /** The two pointers' midpoint and distance as last applied to the map. */
  applied: Pair | null;
  frame: number | null;
  /** The overlay's box, and the client position of the container's corner; read when the first pointer lands. */
  box: Box;
  origin: { x: number; y: number };
};

const NO_BOX: Box = { left: 0, top: 0, right: 0, bottom: 0 };

function measure(element: HTMLElement): Pick<Gesture, "box" | "origin"> {
  const own = element.getBoundingClientRect();
  const parent = element.offsetParent?.getBoundingClientRect();
  const origin = { x: parent?.left ?? 0, y: parent?.top ?? 0 };
  return {
    origin,
    box: { left: own.left - origin.x, top: own.top - origin.y, right: own.right - origin.x, bottom: own.bottom - origin.y },
  };
}

function capture(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // The pointer is already gone: its up or cancel follows.
  }
}

function pairOf(pointers: Map<number, ScreenPoint>): Pair {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
}

/**
 * The drawing surface of SCR-012 (WP-28 "Lasso", BR-APP-061), mounted by a view while the map is in drawing mode.
 * It covers the map between the top bar (8 + 44 + 10 px under the top inset) and the tab bar (its 62 px and 10 px
 * gap above the bottom inset), above every marker, and the browser's own touch gestures are off on it.
 *
 * - The first pointer draws, with pointer capture; a mouse draws the same way (Telegram Desktop), with its main
 *   button. A light haptic marks the start of each stroke, and an outline follows the pointer. A point closer than
 *   4 px to the previous one is skipped; a point outside the overlay is clamped to its box.
 * - A second pointer drops the stroke; while both are down they pan and pinch the map through `host`, applied once
 *   per animation frame. A third is ignored. Nothing draws again until every pointer is up.
 * - Lifting the drawing pointer, or losing its capture (a system gesture took it), ends the stroke:
 *   `lassoToPolygon` gives `onDrawn(polygon)`, or `onTooSmall()` when it rejects the stroke. The outline clears.
 *
 * The host takes the pixels of the map's container. The overlay is placed in the box that holds the container —
 * `MapScreen`'s fixed `inset-0`, which the container fills — so a container point is a client point minus the corner
 * of that box (`offsetParent`), and the overlay's own box in the same pixels is where strokes are clamped.
 */
export function LassoOverlay({ host, onDrawn, onTooSmall }: LassoOverlayProps) {
  const gesture = useRef<Gesture>({
    drawer: null,
    stroke: [],
    pointers: new Map(),
    applied: null,
    frame: null,
    box: NO_BOX,
    origin: { x: 0, y: 0 },
  });
  const latest = useRef({ host, onDrawn, onTooSmall });
  const [outline, setOutline] = useState("");

  useLayoutEffect(() => {
    latest.current = { host, onDrawn, onTooSmall };
  });

  useEffect(() => {
    const current = gesture.current;
    return () => {
      if (current.frame !== null) {
        cancelAnimationFrame(current.frame);
        current.frame = null;
      }
    };
  }, []);

  const draw = (stroke: readonly ScreenPoint[]) => {
    const { box } = gesture.current;
    setOutline(stroke.map(({ x, y }) => `${x - box.left},${y - box.top}`).join(" "));
  };

  const pointOf = (event: PointerEvent<HTMLElement>): ScreenPoint => {
    const { origin } = gesture.current;
    return { x: event.clientX - origin.x, y: event.clientY - origin.y };
  };

  const clamped = ({ x, y }: ScreenPoint): ScreenPoint => {
    const { box } = gesture.current;
    return { x: Math.min(Math.max(x, box.left), box.right), y: Math.min(Math.max(y, box.top), box.bottom) };
  };

  const apply = () => {
    const current = gesture.current;
    const before = current.applied;
    if (current.pointers.size < 2 || before === null) {
      return;
    }
    const now = pairOf(current.pointers);
    const { host: map } = latest.current;
    if (now.x !== before.x || now.y !== before.y) {
      map.panBy(now.x - before.x, now.y - before.y);
    }
    if (before.distance > 0 && now.distance > 0 && now.distance !== before.distance) {
      map.zoomAround(now.x, now.y, now.distance / before.distance);
    }
    current.applied = now;
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if ((event.pointerType === "mouse" && event.button !== 0) || current.pointers.size >= 2) {
      return;
    }
    event.preventDefault();
    if (current.pointers.size === 0) {
      Object.assign(current, measure(event.currentTarget));
    }
    capture(event.currentTarget, event.pointerId);
    const point = pointOf(event);
    current.pointers.set(event.pointerId, point);
    if (current.pointers.size === 1) {
      current.drawer = event.pointerId;
      current.stroke = [clamped(point)];
      draw(current.stroke);
      tg.haptic.impact();
      return;
    }
    current.drawer = null;
    current.stroke = [];
    setOutline("");
    current.applied = pairOf(current.pointers);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current.pointers.has(event.pointerId)) {
      return;
    }
    const point = pointOf(event);
    current.pointers.set(event.pointerId, point);
    if (current.drawer === event.pointerId) {
      const next = clamped(point);
      const last = current.stroke[current.stroke.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) >= LASSO_POINT_SPACING_PX) {
        current.stroke.push(next);
        draw(current.stroke);
      }
    } else if (current.pointers.size === 2 && current.frame === null) {
      current.frame = requestAnimationFrame(() => {
        current.frame = null;
        apply();
      });
    }
  };

  const end = (pointerId: number) => {
    const current = gesture.current;
    if (!current.pointers.has(pointerId)) {
      return;
    }
    if (current.frame !== null) {
      cancelAnimationFrame(current.frame);
      current.frame = null;
      apply();
    }
    current.pointers.delete(pointerId);
    if (current.pointers.size < 2) {
      current.applied = null;
    }
    if (current.drawer !== pointerId) {
      return;
    }
    const { stroke } = current;
    current.drawer = null;
    current.stroke = [];
    setOutline("");
    const { host: map, onDrawn: drawn, onTooSmall: tooSmall } = latest.current;
    const polygon = lassoToPolygon(stroke, (x, y) => map.unproject(x, y));
    if (polygon === null) {
      tooSmall();
    } else {
      drawn(polygon);
    }
  };

  return (
    <div
      data-lasso=""
      className="absolute inset-x-0 top-[calc(var(--top-inset)+62px)] bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+10px)] z-[calc(var(--z-pin)+1)] cursor-crosshair touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        onPointerMove(event);
        end(event.pointerId);
      }}
      onPointerCancel={(event) => end(event.pointerId)}
      onLostPointerCapture={(event) => end(event.pointerId)}
    >
      {outline !== "" ? (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <polyline
            data-lasso-stroke=""
            points={outline}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-text"
          />
        </svg>
      ) : null}
    </div>
  );
}
