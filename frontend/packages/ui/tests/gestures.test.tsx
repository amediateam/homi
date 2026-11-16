import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Activity, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SHEET_DRAG_CLOSE_SHARE,
  SHEET_DRAG_CLOSE_VELOCITY,
  SHEET_DRAG_SETTLE_MS,
  SHEET_DRAG_START_PX,
  type SheetDragOptions,
  useSheetDrag,
} from "../src/index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Height of the sheet in these tests: a quarter of it is 100 px. */
const HEIGHT = 400;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(HEIGHT);
});

interface HarnessProps extends Omit<SheetDragOptions, "backdropRef"> {
  onClose: () => void;
}

/** A sheet with a header (the handle area), a body and a backdrop, wired as `BottomSheet` wires them. */
function Harness({ onClose, ...options }: HarnessProps) {
  const backdrop = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  useSheetDrag(handle, sheet, onClose, { ...options, backdropRef: backdrop });
  return (
    <>
      <div ref={backdrop} data-testid="backdrop" />
      <div ref={sheet} data-testid="sheet">
        <div ref={handle} data-testid="handle">
          <button type="button">Reset</button>
        </div>
        <div data-testid="body">body</div>
      </div>
    </>
  );
}

const sheet = () => screen.getByTestId("sheet");
const handle = () => screen.getByTestId("handle");
const backdrop = () => screen.getByTestId("backdrop");

/** A drag on `target` straight down by `distance` px that lasts `ms` from the press to the release. */
function drag(target: Element, distance: number, ms: number, { release = true } = {}): void {
  fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 100 + SHEET_DRAG_START_PX });
  vi.advanceTimersByTime(ms);
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 100 + distance });
  if (release) {
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY: 100 + distance });
  }
}

function reducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe("useSheetDrag", () => {
  it("keeps the legacy constants", () => {
    expect([SHEET_DRAG_START_PX, SHEET_DRAG_CLOSE_SHARE, SHEET_DRAG_CLOSE_VELOCITY, SHEET_DRAG_SETTLE_MS]).toEqual([
      6, 0.25, 0.5, 200,
    ]);
  });

  it("follows the finger from 6 px and dims the backdrop with it", () => {
    const onDragStart = vi.fn();
    render(<Harness onClose={vi.fn()} onDragStart={onDragStart} />);

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 105 });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");

    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 106 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(sheet().hasAttribute("data-dragging")).toBe(true);

    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 200 });
    expect(sheet().style.transform).toBe("translateY(100px)");
    expect(backdrop().style.opacity).toBe("0.75");
    // The entrance animations would override the inline styles with their fill.
    expect(sheet().style.animation).toContain("none");
    expect(backdrop().style.animation).toContain("none");
  });

  it("below both thresholds settles back and does not close", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    drag(handle(), HEIGHT * SHEET_DRAG_CLOSE_SHARE, 1000);
    expect(sheet().style.transform).toBe("translateY(0px)");
    expect(sheet().style.transition).toContain(`${SHEET_DRAG_SETTLE_MS}ms`);
    expect(sheet().hasAttribute("data-dragging")).toBe(false);

    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(sheet().style.transform).toBe("");
    expect(backdrop().style.opacity).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes past a quarter of the height, after the slide", () => {
    const onClose = vi.fn();
    const onCommit = vi.fn();
    render(<Harness onClose={onClose} onCommit={onCommit} />);

    drag(handle(), HEIGHT * SHEET_DRAG_CLOSE_SHARE + 1, 1000);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(sheet().hasAttribute("data-closing")).toBe(true);
    expect(sheet().style.transform).toBe(`translateY(${HEIGHT}px)`);
    expect(backdrop().style.opacity).toBe("0");

    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS - 1);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The sheet stays out until its owner unmounts it.
    expect(sheet().style.transform).toBe(`translateY(${HEIGHT}px)`);
  });

  it("closes a short drag faster than 0.5 px/ms, and not a slower one", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    // 40 px in 100 ms: 0.4 px/ms.
    drag(handle(), 40, 100);
    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(onClose).not.toHaveBeenCalled();

    // 40 px in 60 ms: 0.67 px/ms.
    drag(handle(), 40, 60);
    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls the callback passed after mount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness onClose={first} />);
    rerender(<Harness onClose={second} />);

    drag(handle(), 200, 1000);
    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("settles at once under reduced motion", () => {
    reducedMotion(true);
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    drag(handle(), 50, 1000);
    expect(sheet().style.transform).toBe("");
    expect(sheet().style.transition).toBe("");

    drag(handle(), 200, 1000);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sheet().style.transition).toBe("none");
  });

  it("is not a drag upwards, sideways, inside the body or when disabled", () => {
    const onClose = vi.fn();
    const onDragStart = vi.fn();
    const { rerender } = render(<Harness onClose={onClose} onDragStart={onDragStart} />);

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 90 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 100, clientY: 300 });

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 130, clientY: 120 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 130, clientY: 300 });

    drag(screen.getByTestId("body"), 300, 100);

    rerender(<Harness onClose={onClose} onDragStart={onDragStart} enabled={false} />);
    drag(handle(), 300, 100);

    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");
  });

  it("a cancelled pointer settles back", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    drag(handle(), 300, 50, { release: false });
    fireEvent.pointerCancel(handle(), { pointerId: 1 });
    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");
  });

  it("swallows the click a drag ends with, not the next tap", () => {
    const onReset = vi.fn();
    render(<Harness onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Reset" });
    button.addEventListener("click", onReset);

    // A pointer's click counts its presses in `detail`.
    drag(button, 50, 1000);
    fireEvent.click(button, { detail: 1 });
    expect(onReset).not.toHaveBeenCalled();

    fireEvent.pointerDown(button, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(button, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.click(button, { detail: 1 });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("after a touch drag that ended with no click, Enter or Space on a button still presses it", () => {
    const onReset = vi.fn();
    render(<Harness onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Reset" });
    button.addEventListener("click", onReset);

    // A touch that moved gets no click from the browser; the sheet settles back.
    drag(button, 50, 1000);
    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    // The keyboard's click has no press before it and `detail` 0.
    fireEvent.click(button, { detail: 0 });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("a sheet hidden with its route mid-drag loses every inline style, and drags again when shown", () => {
    const onClose = vi.fn();
    const tree = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <Harness onClose={onClose} />
      </Activity>
    );
    const { rerender } = render(tree("visible"));

    drag(handle(), 50, 1000, { release: false });
    expect(sheet().style.animation).toContain("none");
    expect(backdrop().style.opacity).toBe("0.875");

    // React clears the backdrop's ref before the cleanup runs; the hook still finds the element it styled.
    rerender(tree("hidden"));
    for (const element of [sheet(), backdrop()]) {
      expect([element.style.animation, element.style.transform, element.style.opacity]).toEqual(["", "", ""]);
    }
    expect(sheet().hasAttribute("data-dragging")).toBe(false);

    // Shown again, the entrance plays from the class (the animation is not held off inline) and the drag is back.
    rerender(tree("visible"));
    drag(handle(), 200, 1000);
    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unmounting mid-drag removes the listeners and calls nothing", () => {
    const onClose = vi.fn();
    const removed = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Harness onClose={onClose} />);

    drag(handle(), 300, 50, { release: false });
    unmount();
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]),
    );

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 400 });
    vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS);
    expect(onClose).not.toHaveBeenCalled();
  });
});
