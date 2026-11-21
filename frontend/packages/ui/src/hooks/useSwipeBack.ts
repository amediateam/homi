"use client";

import { type RefObject, useEffect, useRef } from "react";

import { prefersReducedMotion } from "./prefersReducedMotion";

/** Finger travel, in px, after which the gesture decides whether it is a swipe back (`03` §3.4). */
export const SWIPE_BACK_START_PX = 10;
/** Released past this share of the screen width, the layer closes. */
export const SWIPE_BACK_CLOSE_SHARE = 0.33;
/** Released at an average speed above this, in px/ms, the layer closes whatever the distance. */
export const SWIPE_BACK_CLOSE_VELOCITY = 0.5;
/** The slide out (closing) or back (staying) after the release, in ms. */
export const SWIPE_BACK_SETTLE_MS = 180;
/**
 * After a closing swipe the inline styles go this long after `onBack` if the layer is no longer shown (legacy since
 * `index-CBlEKxdL.js`, WP-82), so a layer kept in the document is not left translated off-screen for its next showing.
 * A layer still shown then (a navigation that takes longer) stays out until its cleanup resets it: it never snaps back.
 */
export const SWIPE_BACK_RESET_MS = 300;
/** A swipe is ours only when its sideways travel is at least this many times its vertical travel. */
export const SWIPE_BACK_HORIZONTAL_RATIO = 1.5;
/**
 * Areas whose horizontal gestures belong to themselves (`03` §1.2): strips that scroll sideways, form fields,
 * editable text and map containers. A touch that starts inside one never becomes a swipe back.
 */
export const SWIPE_BACK_EXCLUDED = [
  "[data-no-swipe]",
  "[data-scroll-x]",
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  ".maplibregl-map",
  ".leaflet-container",
  "[data-map]",
].join(", ");

/** With `edgeOnly`, a swipe starts only this close to the layer's left edge (WP-81's place picker). */
export const SWIPE_BACK_EDGE_PX = 24;

export interface SwipeBackOptions {
  /** `false` attaches nothing: Android (TMA-041), or a layer open over this one. Default `true`. */
  enabled?: boolean;
  /** The layer starts to follow the finger. */
  onSwipeStart?: () => void;
  /** The release closes the layer; legacy plays a light impact here (TMA-025). `onBack` follows after the slide. */
  onCommit?: () => void;
  /**
   * A swipe starts only within the left 24 px of the layer, even over an excluded area (a map takes every other
   * touch); the layer is marked `data-edge-swipe`. Default `false`.
   */
  edgeOnly?: boolean;
}

/** `pending`: a finger is down, direction unknown; `ignored`: this touch is not ours; `closed`: the layer is out. */
type Phase = "idle" | "pending" | "ignored" | "dragging" | "settling" | "closed";

/**
 * Swipe back on a full-screen layer (WP-23, `03` §1.2): a rightward swipe moves the layer with the finger; released
 * past a third of the width or fast enough, it slides out and `onBack` runs, otherwise it slides back.
 *
 * Touch events only, as in legacy: a touch screen swipes back on iOS and on the desktop clients, while a mouse or
 * trackpad on Telegram Desktop does not (a sideways mouse drag over a page selects its text; Telegram's own Back is
 * there). `useSheetDrag` takes pointer events because a mouse grabs a sheet by its header, which holds no text.
 *
 * The layer's entrance animation is switched off when a swipe starts (while it runs it overrides the inline
 * transform) and stays off while the hook lives; it has no fill mode, so nothing changes once it is over. The layer
 * stays out after `onBack` until it unmounts, so a navigation that takes a moment does not show it again; the cleanup
 * removes every inline style, the animation's included, so a layer hidden with its cached route and shown again
 * slides in anew. Under `prefers-reduced-motion` both settles are instant. The callbacks are read through a ref, so a
 * new `onBack` passed after mount is the one called.
 */
export function useSwipeBack(
  ref: RefObject<HTMLElement | null>,
  onBack: () => void,
  { enabled = true, onSwipeStart, onCommit, edgeOnly = false }: SwipeBackOptions = {},
): void {
  const callbacks = useRef({ onBack, onSwipeStart, onCommit });
  useEffect(() => {
    callbacks.current = { onBack, onSwipeStart, onCommit };
  });

  useEffect(() => {
    const layer = ref.current;
    if (!layer || !enabled) {
      return undefined;
    }

    let phase: Phase = "idle";
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let offset = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const moveTo = (px: number, ms: number) => {
      layer.style.transition = ms > 0 ? `transform ${ms}ms var(--ease-ios)` : "none";
      layer.style.transform = `translateX(${px}px)`;
    };
    const reset = () => {
      clearTimeout(timer);
      layer.style.transition = "";
      layer.style.transform = "";
      layer.style.willChange = "";
      layer.removeAttribute("data-swiping");
      layer.removeAttribute("data-gone");
    };
    const settleBack = () => {
      const done = () => {
        reset();
        phase = "idle";
      };
      if (prefersReducedMotion()) {
        done();
        return;
      }
      phase = "settling";
      moveTo(0, SWIPE_BACK_SETTLE_MS);
      timer = setTimeout(done, SWIPE_BACK_SETTLE_MS);
    };
    const close = () => {
      phase = "settling";
      // The swipe is the layer's way out: no leave plays on top of it (`lib/leave.ts`).
      layer.setAttribute("data-gone", "");
      callbacks.current.onCommit?.();
      const done = () => {
        phase = "closed";
        layer.style.willChange = "";
        callbacks.current.onBack();
        timer = setTimeout(() => {
          const shown = layer.isConnected && layer.getClientRects().length > 0;
          if (!shown) {
            reset();
            phase = "idle";
          }
        }, SWIPE_BACK_RESET_MS);
      };
      if (prefersReducedMotion()) {
        moveTo(window.innerWidth, 0);
        done();
        return;
      }
      moveTo(window.innerWidth, SWIPE_BACK_SETTLE_MS);
      timer = setTimeout(done, SWIPE_BACK_SETTLE_MS);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (phase === "settling" || phase === "closed") {
        return;
      }
      if (phase === "dragging") {
        // A second finger: give the layer back rather than leave it half-way.
        settleBack();
        return;
      }
      const target = event.target;
      // Nested sub-pages (WP-82): a touch inside another sub-page is that one's swipe, never also this layer's.
      const page = target instanceof Element ? target.closest('[data-slot="subpage"]') : null;
      if (page !== null && page !== layer) {
        phase = "ignored";
        return;
      }
      const fromEdge = edgeOnly && event.touches.length === 1 && event.touches[0]!.clientX - layer.getBoundingClientRect().left <= SWIPE_BACK_EDGE_PX;
      if (event.touches.length !== 1 || (edgeOnly ? !fromEdge : target instanceof Element && target.closest(SWIPE_BACK_EXCLUDED))) {
        phase = "ignored";
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startedAt = performance.now();
      offset = 0;
      phase = "pending";
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if ((phase !== "pending" && phase !== "dragging") || !touch) {
        return;
      }
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (phase === "pending") {
        if (Math.abs(dx) < SWIPE_BACK_START_PX && Math.abs(dy) < SWIPE_BACK_START_PX) {
          return;
        }
        if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * SWIPE_BACK_HORIZONTAL_RATIO) {
          phase = "ignored";
          return;
        }
        phase = "dragging";
        layer.style.willChange = "transform";
        layer.style.animation = "none";
        layer.setAttribute("data-swiping", "");
        callbacks.current.onSwipeStart?.();
      }
      // The page under the finger must not scroll while the layer follows it.
      event.preventDefault();
      offset = Math.max(0, dx);
      moveTo(offset, 0);
    };

    const onTouchEnd = () => {
      if (phase !== "dragging") {
        if (phase === "pending" || phase === "ignored") {
          phase = "idle";
        }
        return;
      }
      const velocity = offset / Math.max(1, performance.now() - startedAt);
      if (offset > window.innerWidth * SWIPE_BACK_CLOSE_SHARE || velocity > SWIPE_BACK_CLOSE_VELOCITY) {
        close();
      } else {
        settleBack();
      }
    };

    /** The system took the touch: never a reason to close. */
    const onTouchCancel = () => {
      if (phase === "dragging") {
        settleBack();
      } else if (phase === "pending" || phase === "ignored") {
        phase = "idle";
      }
    };

    if (edgeOnly) {
      layer.setAttribute("data-edge-swipe", "");
    }
    layer.addEventListener("touchstart", onTouchStart, { passive: true });
    layer.addEventListener("touchmove", onTouchMove, { passive: false });
    layer.addEventListener("touchend", onTouchEnd);
    layer.addEventListener("touchcancel", onTouchCancel);
    return () => {
      layer.removeEventListener("touchstart", onTouchStart);
      layer.removeEventListener("touchmove", onTouchMove);
      layer.removeEventListener("touchend", onTouchEnd);
      layer.removeEventListener("touchcancel", onTouchCancel);
      reset();
      layer.style.animation = "";
      layer.removeAttribute("data-edge-swipe");
    };
  }, [ref, enabled, edgeOnly]);
}
