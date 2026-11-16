import { SHEET_DRAG_SETTLE_MS } from "@homi/ui";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Activity } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
/** The address the sheet reads is the document's; a test changes it with `replaceState` and re-renders. */
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { RouteSheet, type RouteSheetProps } from "@/features/shell/RouteSheet";

import { dragDown } from "../helpers/gestures";

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  state.back.mockReset();
  fake = fakeTelegram({ version: "8.0" });
  window.history.replaceState(null, "", "/ru/filters");
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
});

function Sheet(props: Partial<RouteSheetProps>) {
  return (
    <RouteSheet variant="full" title="Фильтры" closeLabel="Закрыть" {...props}>
      <p>Body</p>
    </RouteSheet>
  );
}

const part = (slot: string) => document.querySelector<HTMLElement>(`[data-slot="bottom-sheet${slot}"]`)!;
const close = () => fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
const escape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

/** Radix listens for a press outside one task after the sheet opens. */
const outsideListenersReady = () => act(() => vi.advanceTimersByTimeAsync(0));

/** A tap on the backdrop: Radix waits for the click that follows the press. */
function tapBackdrop() {
  fireEvent.pointerDown(part("-overlay"), { pointerId: 2, button: 0 });
  fireEvent.pointerUp(part("-overlay"), { pointerId: 2, button: 0 });
  fireEvent.click(part("-overlay"));
}

describe("RouteSheet, layer (the copy in @sheet)", () => {
  it("is open while mounted and named by its title", () => {
    render(<Sheet />);
    expect(screen.getByRole("dialog", { name: "Фильтры" }).getAttribute("data-variant")).toBe("full");
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("the × calls back() once, also when tapped again before the address changes", () => {
    render(<Sheet />);
    close();
    close();
    expect(state.back).toHaveBeenCalledTimes(1);

    // A copy that stays while its address changes (a layer parameter closed at depth 0) closes again.
    window.history.replaceState(null, "", "/ru/filters?city=andijan");
    close();
    expect(state.back).toHaveBeenCalledTimes(2);
  });

  it("a backdrop tap calls back() once", async () => {
    render(<Sheet />);
    await outsideListenersReady();
    tapBackdrop();
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("Escape calls back() once", async () => {
    render(<Sheet />);
    await outsideListenersReady();
    escape();
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("a drag that closes plays one light impact and calls back() once, after the slide", async () => {
    render(<Sheet />);
    await outsideListenersReady();

    dragDown(part("-header"), 300);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(state.back).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("a short slow drag settles back: no impact, no close", async () => {
    render(<Sheet />);
    // 40 px of a 400 px sheet in 1 s: neither a quarter of the height nor 0.5 px/ms.
    dragDown(part("-header"), 40, 1000);
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    expect(haptics()).toEqual([]);
    expect(state.back).not.toHaveBeenCalled();
  });

  it("a copy that stays when a drag closed a layer parameter rises again and closes anew", async () => {
    window.history.replaceState(null, "", "/ru/filters?pick=city");
    const { rerender } = render(<Sheet />);
    await outsideListenersReady();
    dragDown(part("-header"), 300);
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(part("").style.transform).toBe("translateY(400px)");

    // back() replaced `?pick=city` with `/filters`: the same copy, now at its own address.
    window.history.replaceState(null, "", "/ru/filters");
    rerender(<Sheet />);
    expect(part("").style.transform).toBe("");
    expect(part("").hasAttribute("data-closing")).toBe(false);
    close();
    expect(state.back).toHaveBeenCalledTimes(2);
  });

  it("keeps its sheet when the address changes after the ×, or after it was dragged out and hidden", async () => {
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <Sheet />
      </Activity>
    );
    window.history.replaceState(null, "", "/ru/filters?pick=city");
    const { rerender } = render(view("visible"));
    const shown = part("");
    close();
    window.history.replaceState(null, "", "/ru/filters");
    rerender(view("visible"));
    expect(part("")).toBe(shown);

    // Dragged out, hidden with its cached route and shown again at the same address: a later change keeps it.
    dragDown(part("-header"), 300);
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    rerender(view("hidden"));
    rerender(view("visible"));
    const again = part("");
    window.history.replaceState(null, "", "/ru/filters?rooms=2");
    rerender(view("visible"));
    expect(part("")).toBe(again);
  });

  it("non-dismissible: the backdrop, the drag and Escape do nothing; the × still closes", async () => {
    render(<Sheet dismissible={false} />);
    await outsideListenersReady();

    tapBackdrop();
    dragDown(part("-header"), 300);
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    escape();
    expect(state.back).not.toHaveBeenCalled();

    close();
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("a copy shown again after it was hidden closes anew", () => {
    const { unmount } = render(<Sheet />);
    close();
    unmount();

    render(<Sheet />);
    close();
    expect(state.back).toHaveBeenCalledTimes(2);
  });

  it("is portalled: the server HTML of the page below does not hold it", () => {
    expect(renderToString(<Sheet />)).not.toContain("Body");
  });
});

describe("RouteSheet, standalone (a sheet address loaded directly)", () => {
  it("ignores a backdrop tap and the drag: no page lies below", async () => {
    render(<Sheet presentation="standalone" />);
    await outsideListenersReady();

    tapBackdrop();
    dragDown(part("-header"), 300);
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    expect(state.back).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
    expect(part("").style.transform).toBe("");
  });

  it("the × calls back() once, which at depth 0 goes to the parent address as BackButton does", () => {
    render(<Sheet presentation="standalone" />);
    close();
    close();
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("Escape closes it like the ×, unless it is non-dismissible", async () => {
    const { unmount } = render(<Sheet presentation="standalone" />);
    await outsideListenersReady();
    escape();
    expect(state.back).toHaveBeenCalledTimes(1);
    unmount();

    render(<Sheet presentation="standalone" dismissible={false} />);
    await outsideListenersReady();
    escape();
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("renders in place, so the server HTML of the direct load holds the sheet and its content", () => {
    const { container } = render(<Sheet presentation="standalone" />);
    expect(container.contains(screen.getByRole("dialog", { name: "Фильтры" }))).toBe(true);

    const html = renderToString(<Sheet presentation="standalone" />);
    expect(html).toContain('data-slot="bottom-sheet"');
    expect(html).toContain("Body");
  });
});
