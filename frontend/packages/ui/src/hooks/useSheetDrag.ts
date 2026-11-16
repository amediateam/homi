"use client";

import { type RefObject, useEffect, useRef } from "react";

import { prefersReducedMotion } from "./prefersReducedMotion";

/** Finger travel, in px, after which a press on the handle area decides whether it is a drag (`03` §3.4). */
export const SHEET_DRAG_START_PX = 6;
/** Released past this share of the sheet's height, the sheet closes. */
export const SHEET_DRAG_CLOSE_SHARE = 0.25;
/** Released at an average speed above this, in px/ms, the sheet closes whatever the distance. */
export const SHEET_DRAG_CLOSE_VELOCITY = 0.5;
/** The slide out (closing) or back (staying) after the release, in ms. */
export const SHEET_DRAG_SETTLE_MS = 200;

export interface SheetDragOptions {
  /** `false` attaches nothing: a non-dismissible sheet. Default `true`. */
  enabled?: boolean;
  /** The backdrop: its opacity follows the share of the sheet still on screen. */
  backdropRef?: RefObject<HTMLElement | null>;
  /** The sheet starts to follow the finger. */
  onDragStart?: () => void;
  /** The release closes the sheet; legacy plays a light impact here (TMA-025). `onClose` follows after the slide. */
  onCommit?: () => void;
}

/** `pending`: a pointer is down, direction unknown; `ignored`: this press is not ours; `closed`: the sheet is out. */
type Phase = "idle" | "pending" | "ignored" | "dragging" | "settling" | "closed";

/** Pointer capture keeps a mouse drag ours outside the handle; absent in jsdom, and it throws for a stale pointer. */
function capturePointer(element: HTMLElement, pointerId: number, capture: boolean): void {
  try {
    if (capture) {
      element.setPointerCapture?.(pointerId);
    } else if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // The pointer is already gone: nothing to capture or release.
  }
}

/**
 * Drag to close a bottom sheet (WP-23, `03` §1.2). Only a press on the handle area (`handleRef`, the sheet's header)
 * drags: a downward move past 6 px makes the sheet follow the pointer and the backdrop fade with it; an upward or
 * mostly sideways move is not a drag, and a press inside the body never is. Released past a quarter of the height
 * or faster than 0.5 px/ms on average, the sheet slides out and `onClose` runs; otherwise it slides back. The pointer
 * click that ends a drag does not reach a button under the finger; a click no pointer made (Enter or Space on the ×,
 * `detail` 0) always does.
 *
 * Pointer events, so a mouse drags on Telegram Desktop too. While the pointer drags the sheet carries
 * `data-dragging`, and from the release that closes it `data-closing`, so the owner can ignore other close requests
 * meanwhile. The sheet stays out after `onClose` until it unmounts, so a navigation that takes a moment does not show
 * it again. The entrance animations are switched off on the first drag (their fill would override the inline
 * transform and opacity) and stay off while the hook lives, so a settle-back does not replay them. The cleanup
 * removes the listeners and every inline style, the animations' included: a sheet hidden with its cached route and
 * shown again rises and fades in anew. Under `prefers-reduced-motion` both settles are instant. The callbacks are
 * read through a ref, so a new `onClose` passed after mount is the one called.
 */
export function useSheetDrag(
  handleRef: RefObject<HTMLElement | null>,
  sheetRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  { enabled = true, backdropRef, onDragStart, onCommit }: SheetDragOptions = {},
): void {
  const callbacks = useRef({ onClose, onDragStart, onCommit });
  useEffect(() => {
    callbacks.current = { onClose, onDragStart, onCommit };
  });

  useEffect(() => {
    const handle = handleRef.current;
    const sheet = sheetRef.current;
    if (!handle || !sheet || !enabled) {
      return undefined;
    }

    let phase: Phase = "idle";
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let offset = 0;
    let swallowClick = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let knownBackdrop: HTMLElement | null = null;
    /** Remembered once found: React clears the ref before the cleanup of an unmount or a hidden route runs. */
    const backdrop = () => {
      knownBackdrop = backdropRef?.current ?? knownBackdrop;
      return knownBackdrop;
    };

    const moveTo = (px: number, ms: number) => {
      const transition = (property: string) => (ms > 0 ? `${property} ${ms}ms var(--ease-ios)` : "none");
      sheet.style.transition = transition("transform");
      sheet.style.transform = `translateY(${px}px)`;
      const dim = backdrop();
      if (dim) {
        dim.style.transition = transition("opacity");
        dim.style.opacity = String(Math.max(0, 1 - px / Math.max(1, sheet.offsetHeight)));
      }
    };
    const reset = () => {
      clearTimeout(timer);
      capturePointer(handle, pointerId, false);
      sheet.style.transition = "";
      sheet.style.transform = "";
      sheet.style.willChange = "";
      sheet.removeAttribute("data-dragging");
      sheet.removeAttribute("data-closing");
      const dim = backdrop();
      if (dim) {
        dim.style.transition = "";
        dim.style.opacity = "";
      }
    };
    const settleBack = () => {
      sheet.removeAttribute("data-dragging");
      const done = () => {
        reset();
        phase = "idle";
      };
      if (prefersReducedMotion()) {
        done();
        return;
      }
      phase = "settling";
      moveTo(0, SHEET_DRAG_SETTLE_MS);
      timer = setTimeout(done, SHEET_DRAG_SETTLE_MS);
    };
    const close = () => {
      phase = "settling";
      sheet.removeAttribute("data-dragging");
      sheet.setAttribute("data-closing", "");
      callbacks.current.onCommit?.();
      const height = sheet.offsetHeight;
      const done = () => {
        phase = "closed";
        sheet.style.willChange = "";
        callbacks.current.onClose();
      };
      if (prefersReducedMotion()) {
        moveTo(height, 0);
        done();
        return;
      }
      moveTo(height, SHEET_DRAG_SETTLE_MS);
      timer = setTimeout(done, SHEET_DRAG_SETTLE_MS);
    };

    const onPointerDown = (event: PointerEvent) => {
      // A new press: the click of the last drag, if any, has already been and gone.
      swallowClick = false;
      if (phase === "settling" || phase === "closed") {
        return;
      }
      if (phase !== "idle") {
        if (event.pointerId !== pointerId) {
          // A second finger: give the sheet back rather than leave it half-way.
          if (phase === "dragging") {
            settleBack();
          } else {
            phase = "ignored";
          }
        }
        return;
      }
      if (event.button !== 0) {
        return;
      }
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startedAt = performance.now();
      offset = 0;
      phase = "pending";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || (phase !== "pending" && phase !== "dragging")) {
        return;
      }
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (phase === "pending") {
        if (Math.abs(dx) < SHEET_DRAG_START_PX && Math.abs(dy) < SHEET_DRAG_START_PX) {
          return;
        }
        if (dy <= 0 || Math.abs(dy) < Math.abs(dx)) {
          phase = "ignored";
          return;
        }
        phase = "dragging";
        sheet.setAttribute("data-dragging", "");
        sheet.style.willChange = "transform";
        sheet.style.animation = "none";
        const dim = backdrop();
        if (dim) {
          dim.style.animation = "none";
        }
        capturePointer(handle, pointerId, true);
        callbacks.current.onDragStart?.();
      }
      offset = Math.max(0, dy);
      moveTo(offset, 0);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      if (phase !== "dragging") {
        if (phase === "pending" || phase === "ignored") {
          phase = "idle";
        }
        return;
      }
      swallowClick = true;
      capturePointer(handle, pointerId, false);
      const velocity = offset / Math.max(1, performance.now() - startedAt);
      if (offset > sheet.offsetHeight * SHEET_DRAG_CLOSE_SHARE || velocity > SHEET_DRAG_CLOSE_VELOCITY) {
        close();
      } else {
        settleBack();
      }
    };

    /** The system took the pointer: never a reason to close. */
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      if (phase === "dragging") {
        settleBack();
      } else if (phase === "pending" || phase === "ignored") {
        phase = "idle";
      }
    };

    /**
     * The click a drag ends with would press the × or an action under the finger. A touch drag that moved ends with
     * no click at all and leaves the flag set until the next press, so a click with `detail` 0 (Enter or Space, or
     * a programmatic click) is never this one.
     */
    const onClickCapture = (event: MouseEvent) => {
      if (!swallowClick || event.detail === 0) {
        return;
      }
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // Move and release are read on the window: a mouse that leaves the handle before the drag starts stays ours.
    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("click", onClickCapture, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      reset();
      sheet.style.animation = "";
      const dim = backdrop();
      if (dim) {
        dim.style.animation = "";
      }
    };
  }, [handleRef, sheetRef, backdropRef, enabled]);
}
