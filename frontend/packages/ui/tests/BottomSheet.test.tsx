import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomSheet, type BottomSheetProps, SHEET_DRAG_SETTLE_MS } from "../src/index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type SheetProps = Partial<BottomSheetProps> & { onClose?: () => void };

function Sheet({ title = "Filters", onClose = () => undefined, open = true, children, ...props }: SheetProps) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose} {...props}>
      {children ?? <p>Body</p>}
    </BottomSheet>
  );
}

/** Every sheet, also those a sheet stacked above has hidden from the accessibility tree. */
const sheets = () => [...document.querySelectorAll<HTMLElement>('[data-slot="bottom-sheet"]')];
const part = (sheet: HTMLElement, slot: string) => sheet.querySelector<HTMLElement>(`[data-slot="bottom-sheet-${slot}"]`)!;
const overlay = () => document.querySelector<HTMLElement>('[data-slot="bottom-sheet-overlay"]')!;
const overlays = () => [...document.querySelectorAll<HTMLElement>('[data-slot="bottom-sheet-overlay"]')];

/** Radix listens for a press outside one task after the sheet opens, and gives focus back one task after it closes. */
async function outsideListenersReady() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** A tap on the backdrop by a second finger: Radix waits for the click that follows the press. */
function tapBackdrop(backdrop = overlay()) {
  fireEvent.pointerDown(backdrop, { pointerId: 2, button: 0 });
  fireEvent.pointerUp(backdrop, { pointerId: 2, button: 0 });
  fireEvent.click(backdrop);
}

function dragDown(target: HTMLElement, distance: number, { release = true } = {}) {
  fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 110 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 100 + distance });
  if (release) {
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY: 100 + distance });
  }
}

/** A touch move on `target` (jsdom has no `Touch` constructor, so the points are plain). */
function touchMove(target: Element, from: { x: number; y: number }, to: { x: number; y: number }): TouchEvent {
  const point = (x: number, y: number) => ({ identifier: 0, target, clientX: x, clientY: y }) as unknown as Touch;
  const start = [point(from.x, from.y)];
  const move = [point(to.x, to.y)];
  target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: start, changedTouches: start }));
  const event = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: move, changedTouches: move });
  target.dispatchEvent(event);
  return event;
}

function scrollable(element: HTMLElement, sizes: Partial<Record<"scrollWidth" | "clientWidth" | "scrollHeight" | "clientHeight", number>>) {
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(element, name, { configurable: true, value });
  }
}

describe("BottomSheet", () => {
  it("is a modal dialog named by its title, focused on open, with the × only when labelled", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sheet onClose={onClose} closeLabel="Close" />);

    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-variant")).toBe("compact");
    // The entrance; the reduced-motion rule of motion.css stops it (tokens.test.ts).
    expect(dialog.className).toMatch(/(?:^|\s)data-\[state=open\]:animate-rise(?:\s|$)/);
    expect(overlay().className).toMatch(/(?:^|\s)data-\[state=open\]:animate-fade(?:\s|$)/);
    expect(document.activeElement).toBe(part(dialog, "title"));
    expect(part(dialog, "handle")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Sheet onClose={onClose} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("compact: `leading` takes the cell left of the title; the full variant ignores it", () => {
    const onBack = vi.fn();
    const leading = (
      <button type="button" data-testid="leading" aria-label="Back" onClick={onBack}>
        ‹
      </button>
    );
    const { rerender } = render(<Sheet leading={leading} closeLabel="Close" />);

    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const row = part(dialog, "title").parentElement!;
    expect(row.firstElementChild).toBe(screen.getByTestId("leading"));
    expect(row.children).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(<Sheet closeLabel="Close" />);
    expect(part(dialog, "title").parentElement!.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(part(dialog, "title").parentElement!.children).toHaveLength(3);

    rerender(<Sheet variant="full" leading={leading} closeLabel="Close" />);
    expect(screen.queryByTestId("leading")).toBeNull();
  });

  it("closes on a backdrop tap and on Escape, not on a tap inside", async () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    await outsideListenersReady();

    fireEvent.pointerDown(screen.getByText("Body"), { pointerId: 1, button: 0 });
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();

    tapBackdrop();
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("gives focus back to the element that opened it, whichever way it closes", async () => {
    function Opened() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} closeLabel="Close" />
        </>
      );
    }
    render(<Opened />);
    const opener = screen.getByRole("button", { name: "Open" });
    const closesBy = async (close: () => void) => {
      opener.focus();
      fireEvent.click(opener);
      await outsideListenersReady();
      expect(document.activeElement).toBe(part(sheets()[0], "title"));
      close();
      await outsideListenersReady();
      expect(sheets()).toHaveLength(0);
      return document.activeElement;
    };

    expect(await closesBy(() => fireEvent.click(screen.getByRole("button", { name: "Close" })))).toBe(opener);
    expect(await closesBy(() => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }))).toBe(
      opener,
    );
    expect(await closesBy(() => tapBackdrop())).toBe(opener);
  });

  it("a non-dismissible sheet ignores the backdrop, Escape and the drag; its × still asks", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} dismissible={false} closeLabel="Close" />);
    await outsideListenersReady();

    tapBackdrop();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    dragDown(part(sheets()[0], "header"), 300);
    await act(() => new Promise((resolve) => setTimeout(resolve, SHEET_DRAG_SETTLE_MS + 20)));
    expect(onClose).not.toHaveBeenCalled();
    expect(sheets()[0].style.transform).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a drag on the header closes once, after the slide; a drag in the body does not", async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    const onClose = vi.fn();
    const onDragCommit = vi.fn();
    render(<Sheet onClose={onClose} onDragCommit={onDragCommit} closeLabel="Close" />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    const sheet = sheets()[0];

    dragDown(part(sheet, "body"), 300);
    expect(sheet.style.transform).toBe("");

    dragDown(part(sheet, "header"), 300, { release: false });
    expect(overlay().style.opacity).toBe("0.25");
    // While the drag holds the sheet, other ways to close wait for it.
    tapBackdrop();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerUp(part(sheet, "header"), { pointerId: 1, clientX: 100, clientY: 400 });
    expect(onDragCommit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("two stacked sheets keep sheet-open until both close; locked follows the full sheet", () => {
    const { rerender } = render(
      <>
        <Sheet title="Filters" variant="full" />
        <Sheet title="City" stacked />
      </>,
    );
    const [filters, city] = sheets();
    expect(document.body.classList.contains("sheet-open")).toBe(true);
    expect(document.body.classList.contains("locked")).toBe(true);
    expect(city.className).toMatch(/z-\(--z-toast\)/);
    expect(filters.className).toMatch(/z-\(--z-backdrop\)/);

    rerender(
      <>
        <Sheet title="Filters" variant="full" />
        <Sheet title="City" stacked open={false} />
      </>,
    );
    expect(sheets()).toHaveLength(1);
    expect(document.body.classList.contains("sheet-open")).toBe(true);

    rerender(
      <>
        <Sheet title="Filters" variant="full" open={false} />
        <Sheet title="City" stacked open={false} />
      </>,
    );
    expect(document.body.classList.contains("sheet-open")).toBe(false);
    expect(document.body.classList.contains("locked")).toBe(false);
  });

  it("a stacked sheet is the top layer: its backdrop and Escape close it alone", async () => {
    const onFilters = vi.fn();
    const onCity = vi.fn();
    const pair = (city: boolean) => (
      <>
        <Sheet title="Filters" variant="full" onClose={onFilters} />
        <Sheet title="City" stacked open={city} onClose={onCity} />
      </>
    );
    const { rerender } = render(pair(true));
    await outsideListenersReady();
    expect(overlays()).toHaveLength(2);

    tapBackdrop(overlays()[1]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onCity).toHaveBeenCalledTimes(2);
    expect(onFilters).not.toHaveBeenCalled();

    // Once the city sheet is gone, the filters sheet is the top layer again.
    rerender(pair(false));
    await outsideListenersReady();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onFilters).toHaveBeenCalledTimes(1);
    expect(onCity).toHaveBeenCalledTimes(2);
  });

  it("unmounting during a drag removes its listeners and gives up its class once", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    const onClose = vi.fn();
    const removed = vi.spyOn(window, "removeEventListener");
    /** The same tree shape throughout, so only the city sheet mounts and unmounts. */
    const Pair = ({ filters = true, city = true }) => (
      <>
        <Sheet title="Filters" open={filters} />
        {city ? <Sheet title="City" stacked onClose={onClose} /> : null}
      </>
    );
    const { rerender } = render(<Pair />);
    dragDown(part(sheets()[1], "header"), 300, { release: false });
    expect(sheets()[1].hasAttribute("data-dragging")).toBe(true);

    rerender(<Pair city={false} />);
    expect(sheets()).toHaveLength(1);
    expect(document.body.classList.contains("sheet-open")).toBe(true);
    expect(removed.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(["pointermove", "pointerup"]));
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 400 });
    act(() => vi.advanceTimersByTime(SHEET_DRAG_SETTLE_MS));
    expect(onClose).not.toHaveBeenCalled();

    rerender(<Pair filters={false} city={false} />);
    expect(document.body.classList.contains("sheet-open")).toBe(false);
  });

  it("the page under it does not scroll; the body and sideways strips do", () => {
    render(
      <Sheet>
        <div data-scroll-x data-testid="strip">
          chips
        </div>
        <p data-testid="text">text</p>
      </Sheet>,
    );
    const sheet = sheets()[0];
    // Read after the sheet's own guard, before Radix' scroll lock on the document has its say.
    const prevented: boolean[] = [];
    const record = (event: Event) => prevented.push(event.defaultPrevented);
    document.body.addEventListener("touchmove", record);

    touchMove(overlay(), { x: 100, y: 300 }, { x: 100, y: 260 });
    touchMove(part(sheet, "header"), { x: 100, y: 20 }, { x: 100, y: 60 });
    const strip = screen.getByTestId("strip");
    scrollable(strip, { scrollWidth: 600, clientWidth: 300 });
    touchMove(strip, { x: 200, y: 100 }, { x: 140, y: 104 });
    touchMove(strip, { x: 200, y: 100 }, { x: 196, y: 140 });
    scrollable(part(sheet, "body"), { scrollHeight: 900, clientHeight: 400 });
    touchMove(screen.getByTestId("text"), { x: 100, y: 200 }, { x: 100, y: 120 });

    document.body.removeEventListener("touchmove", record);
    expect(prevented).toEqual([true, true, false, true, false]);
  });

  it("writes the header and footer heights for the body and a toast inside", () => {
    const heights: Record<string, number> = { "bottom-sheet-header": 58, "bottom-sheet-footer": 76 };
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return heights[this.dataset.slot ?? ""] ?? 0;
    });
    const observed: Element[] = [];
    let resize: () => void = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe(element: Element) {
          observed.push(element);
        }
        disconnect() {}
      },
    );

    const { rerender } = render(<Sheet variant="full" footer={<button type="button">Show</button>} />);
    const sheet = sheets()[0];
    expect(sheet.style.getPropertyValue("--fsheet-head")).toBe("58px");
    expect(sheet.style.getPropertyValue("--fsheet-foot")).toBe("76px");
    expect(observed).toEqual([part(sheet, "header"), part(sheet, "footer")]);

    heights["bottom-sheet-footer"] = 98;
    act(() => resize());
    expect(sheet.style.getPropertyValue("--fsheet-foot")).toBe("98px");

    rerender(<Sheet variant="full" />);
    expect(sheet.style.getPropertyValue("--fsheet-foot")).toBe("0px");
  });

  it("measures once without a ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(50);
    render(<Sheet />);
    expect(sheets()[0].style.getPropertyValue("--fsheet-head")).toBe("50px");
    expect(sheets()[0].style.getPropertyValue("--fsheet-foot")).toBe("0px");
  });

  it("marks the sheet while its body is scrolled", () => {
    render(<Sheet />);
    const sheet = sheets()[0];
    const body = part(sheet, "body");
    expect(sheet.hasAttribute("data-scrolled")).toBe(false);

    body.scrollTop = 40;
    fireEvent.scroll(body);
    expect(sheet.hasAttribute("data-scrolled")).toBe(true);

    body.scrollTop = 0;
    fireEvent.scroll(body);
    expect(sheet.hasAttribute("data-scrolled")).toBe(false);
  });

  it("portal={false} renders in place and into the server HTML; the portal renders nothing on the server", () => {
    const { container } = render(
      <div data-testid="page">
        <Sheet portal={false} />
      </div>,
    );
    expect(screen.getByTestId("page").contains(screen.getByRole("dialog", { name: "Filters" }))).toBe(true);
    expect(screen.getByTestId("page").contains(overlay())).toBe(true);
    expect(container.contains(screen.getByText("Body"))).toBe(true);

    expect(renderToString(<Sheet portal={false} />)).toContain('data-slot="bottom-sheet"');
    expect(renderToString(<Sheet portal={false} />)).toContain("Body");
    expect(renderToString(<Sheet />)).not.toContain("Body");
  });

  it("closeOnEscape keeps Escape on a sheet whose backdrop and drag are off", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} dismissible={false} closeOnEscape portal={false} />);
    await outsideListenersReady();

    tapBackdrop();
    dragDown(part(sheets()[0], "header"), 300);
    await act(() => new Promise((resolve) => setTimeout(resolve, SHEET_DRAG_SETTLE_MS + 20)));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("BottomSheet, an instant opening (WP-30)", () => {
  const RISE = /(?:^|\s)data-\[state=open\]:animate-rise(?:\s|$)/;
  const FADE = /(?:^|\s)data-\[state=open\]:animate-fade(?:\s|$)/;
  const dialog = () => screen.getByRole("dialog", { name: "Filters" });

  it("opens in place: no rise on the sheet, no fade on the backdrop, data-instant on the sheet", () => {
    render(<Sheet instant />);
    expect(dialog().className).not.toMatch(RISE);
    expect(dialog().className).not.toMatch(/animate-/);
    expect(dialog().hasAttribute("data-instant")).toBe(true);
    expect(overlay().className).not.toMatch(FADE);
    expect(overlay().className).not.toMatch(/animate-/);
    // Everything else of the sheet is as usual.
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(part(dialog(), "title"));
  });

  it("without it the sheet rises and carries no data-instant", () => {
    render(<Sheet />);
    expect(dialog().className).toMatch(RISE);
    expect(dialog().hasAttribute("data-instant")).toBe(false);
    expect(overlay().className).toMatch(FADE);
  });

  it("is read when the sheet opens: dropping it on a sheet that is up never starts the rise late", () => {
    const { rerender } = render(<Sheet instant />);
    rerender(<Sheet instant={false} />);
    expect(dialog().className).not.toMatch(RISE);
    expect(overlay().className).not.toMatch(FADE);
    expect(dialog().hasAttribute("data-instant")).toBe(true);
  });

  it("asking for it on a sheet that is up already does not change its entrance either", () => {
    const { rerender } = render(<Sheet />);
    rerender(<Sheet instant />);
    expect(dialog().className).toMatch(RISE);
    expect(dialog().hasAttribute("data-instant")).toBe(false);
  });

  it("the next opening reads it again: closed and opened without it, the sheet rises", () => {
    const { rerender } = render(<Sheet instant />);
    rerender(<Sheet instant={false} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<Sheet instant={false} open />);
    expect(dialog().className).toMatch(RISE);
    expect(overlay().className).toMatch(FADE);

    rerender(<Sheet instant open={false} />);
    rerender(<Sheet instant open />);
    expect(dialog().className).not.toMatch(RISE);
  });

  it("a sheet mounted closed takes the flag of the props it opens with", () => {
    const { rerender } = render(<Sheet instant open={false} />);
    rerender(<Sheet open />);
    expect(dialog().className).toMatch(RISE);
  });

  it("holds in the server HTML of a sheet rendered in place", () => {
    const html = renderToString(<Sheet instant portal={false} />);
    expect(html).toContain("data-instant");
    expect(html).not.toContain("animate-rise");
    expect(html).not.toContain("animate-fade");
    expect(renderToString(<Sheet portal={false} />)).toContain("animate-rise");
  });
});
