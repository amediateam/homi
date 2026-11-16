import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

type TouchType = "touchstart" | "touchmove" | "touchend";

/** A one-finger touch event at `x`; jsdom has no `Touch` constructor, so the point is plain. */
function touch(target: Element, type: TouchType, x: number): void {
  const point = { identifier: 0, target, clientX: x, clientY: 300 } as unknown as Touch;
  const touches = type === "touchend" ? [] : [point];
  target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: [point] }));
}

/** A rightward swipe of `distance` px on `target`; past a third of the screen width it closes a layer. */
export function swipeRight(target: Element, distance: number): void {
  touch(target, "touchstart", 20);
  touch(target, "touchmove", 32);
  touch(target, "touchmove", 20 + distance);
  touch(target, "touchend", 20 + distance);
}

/**
 * A press on `target` dragged `distance` px down and released after `ms` of fake time; past a quarter of the height,
 * or faster than 0.5 px/ms, it closes a sheet.
 */
export function dragDown(target: Element, distance: number, ms = 0): void {
  fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 110 });
  vi.advanceTimersByTime(ms);
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 100 + distance });
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY: 100 + distance });
}

/** The User-Agent of Telegram for Android, which turns swipe back off (TMA-041). */
export const ANDROID_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Telegram-Android/11.2.3 (Google Pixel 8; Android 14; SDK 34; HIGH)";
