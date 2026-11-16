import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const address = vi.hoisted(() => ({ pathname: "/", search: "" }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => address.pathname }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(address.search) }));

import { PullToRefresh } from "@/features/shell/PullToRefresh";
import { PULL_MIN_SPIN_MS } from "@/features/shell/usePullToRefresh";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";
import { registerRefresh } from "@/lib/ui/shellState";

const TOUCH_EVENTS = ["touchstart", "touchmove", "touchend", "touchcancel"];

let fake: FakeTelegram | null = null;
const unregister: (() => void)[] = [];
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  address.pathname = "/";
  address.search = "";
  fake = fakeTelegram({ version: "8.0" });
  clearRecentErrors();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  for (const remove of unregister.splice(0)) {
    remove();
  }
  document.body.className = "";
  document.body.replaceChildren();
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
});

/** Registers `handler` for `path` until the test ends. */
function onRefresh(path: string, handler: () => Promise<unknown> = () => Promise.resolve()) {
  const spy = vi.fn(handler);
  unregister.push(registerRefresh(path, spy));
  return spy;
}

/** A touch event on the page with one finger per `y` (jsdom has no `Touch` constructor, so the points are plain). */
function touch(type: "touchstart" | "touchmove" | "touchend" | "touchcancel", ...ys: number[]) {
  const points = ys.map((y, identifier) => ({ identifier, target: document.body, clientX: 100, clientY: y }) as unknown as Touch);
  document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: points, changedTouches: points }));
}

/** A one-finger pull from y = 100 down by `distance` px; the indicator follows at half of it. */
function pull(distance: number) {
  touch("touchstart", 100);
  touch("touchmove", 110);
  touch("touchmove", 100 + distance);
}

const release = () => touch("touchend");
const indicator = () => document.querySelector<HTMLElement>("[data-ptr]")!;
const phase = () => indicator().dataset.ptr;
const touchListeners = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([type]) => TOUCH_EVENTS.includes(String(type)));
const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("PullToRefresh", () => {
  it("renders an aria-hidden indicator that rests hidden", () => {
    render(<PullToRefresh />);
    expect(indicator().getAttribute("aria-hidden")).toBe("true");
    expect(phase()).toBe("idle");
  });

  it("attaches no listener without a handler for the address", () => {
    onRefresh("/saved");
    const added = vi.spyOn(window, "addEventListener");
    render(<PullToRefresh />);

    expect(touchListeners(added)).toEqual([]);
    pull(200);
    expect(phase()).toBe("idle");
    expect(haptics()).toEqual([]);
  });

  it("attaches passive listeners with a handler and removes them on unmount", () => {
    onRefresh("/");
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<PullToRefresh />);

    expect(touchListeners(added).map(([type, , options]) => [type, options])).toEqual(TOUCH_EVENTS.map((type) => [type, { passive: true }]));
    unmount();
    expect(touchListeners(removed).map(([type]) => type)).toEqual(TOUCH_EVENTS);
  });

  it("starts listening when a handler registers late and stops when it leaves", () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    render(<PullToRefresh />);
    expect(touchListeners(added)).toEqual([]);

    const handler = vi.fn(() => Promise.resolve());
    let remove = () => undefined as void;
    act(() => {
      remove = registerRefresh("/", handler);
    });
    expect(touchListeners(added).map(([type]) => type)).toEqual(TOUCH_EVENTS);
    pull(200);
    release();
    expect(handler).toHaveBeenCalledTimes(1);

    act(() => remove());
    expect(touchListeners(removed).map(([type]) => type)).toEqual(TOUCH_EVENTS);
  });

  it("calls the handler registered last for the address", async () => {
    const first = onRefresh("/");
    render(<PullToRefresh />);
    const second = vi.fn(() => Promise.resolve());
    act(() => {
      unregister.push(registerRefresh("/", second));
    });

    pull(200);
    release();
    await elapse(PULL_MIN_SPIN_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/map", ""],
    ["/settings", ""],
    ["/", "pick=city"],
    ["/saved", "step=report"],
    ["/filters", ""],
    ["/listing/42", ""],
  ])("never starts on %s?%s", (pathname, search) => {
    address.pathname = pathname;
    address.search = search;
    const handler = onRefresh(pathname);
    const added = vi.spyOn(window, "addEventListener");
    render(<PullToRefresh />);

    expect(touchListeners(added)).toEqual([]);
    pull(200);
    release();
    expect(haptics()).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["/", "/saved", "/saved/history", "/radars"])("refreshes the root tab %s", async (pathname) => {
    address.pathname = pathname;
    const handler = onRefresh(pathname);
    render(<PullToRefresh />);

    pull(200);
    release();
    expect(handler).toHaveBeenCalledTimes(1);
    await elapse(PULL_MIN_SPIN_MS);
    expect(phase()).toBe("idle");
  });

  it("does not start when the page is scrolled at the touch", () => {
    const handler = onRefresh("/");
    render(<PullToRefresh />);

    vi.stubGlobal("scrollY", 1);
    touch("touchstart", 100);
    // Back at the top while the finger is down (the momentum ran out): still not a pull.
    vi.stubGlobal("scrollY", 0);
    touch("touchmove", 300);
    expect(phase()).toBe("idle");
    release();
    expect(haptics()).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["locked", "sheet-open", "listing-open"])("does not start while body has %s", (name) => {
    const handler = onRefresh("/");
    render(<PullToRefresh />);
    document.body.classList.add(name);

    pull(200);
    expect(phase()).toBe("idle");
    release();
    expect(haptics()).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("follows at half the finger, at most 110 px, and arms at 72 px with one light impact", () => {
    onRefresh("/");
    render(<PullToRefresh />);

    touch("touchstart", 100);
    touch("touchmove", 243);
    expect(phase()).toBe("pulling");
    expect(indicator().style.transform).toBe("translate(-50%, 11.5px) rotate(178.75deg)");
    expect(indicator().style.opacity).toBe("1");
    expect(haptics()).toEqual([]);

    touch("touchmove", 244);
    expect(phase()).toBe("armed");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);

    touch("touchmove", 500);
    expect(indicator().style.transform).toBe("translate(-50%, 50px) rotate(180deg)");
    expect(haptics()).toHaveLength(1);

    touch("touchmove", 200);
    expect(phase()).toBe("pulling");
    touch("touchmove", 260);
    expect(phase()).toBe("armed");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)", "HapticFeedback.impactOccurred(light)"]);
  });

  it("settles without a refresh when released before the trigger", () => {
    const handler = onRefresh("/");
    render(<PullToRefresh />);

    pull(140);
    release();
    expect(phase()).toBe("idle");
    expect(indicator().style.opacity).toBe("0");
    expect(handler).not.toHaveBeenCalled();
  });

  it("spins at least 700 ms when the handler resolves at once", async () => {
    const handler = onRefresh("/");
    render(<PullToRefresh />);

    pull(200);
    release();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(phase()).toBe("refreshing");
    expect(indicator().style.transform).toBe("translate(-50%, 4px) rotate(160deg)");

    // Literal values: the 700 ms of `03` §3.4, not whatever the constant says.
    await elapse(699);
    expect(phase()).toBe("refreshing");
    await elapse(1);
    expect(phase()).toBe("idle");
    expect(indicator().style.transform).toBe("translate(-50%, -60px) rotate(0deg)");
  });

  it("a refresh cut short by leaving the address puts the indicator away", async () => {
    onRefresh("/", () => new Promise(() => undefined));
    const { rerender } = render(<PullToRefresh />);

    pull(200);
    release();
    expect(phase()).toBe("refreshing");
    expect(indicator().style.opacity).toBe("1");

    address.pathname = "/map";
    rerender(<PullToRefresh />);
    expect(phase()).toBe("idle");
    expect(indicator().style.opacity).toBe("0");
    await elapse(PULL_MIN_SPIN_MS);
    expect(phase()).toBe("idle");
  });

  it("spins as long as a slower handler runs", async () => {
    onRefresh("/", () => new Promise((resolve) => setTimeout(resolve, 1200)));
    render(<PullToRefresh />);

    pull(200);
    release();
    await elapse(PULL_MIN_SPIN_MS);
    expect(phase()).toBe("refreshing");
    await elapse(500);
    expect(phase()).toBe("idle");
  });

  it("ignores pulls during a refresh", async () => {
    const handler = onRefresh("/", () => new Promise((resolve) => setTimeout(resolve, 1000)));
    render(<PullToRefresh />);

    pull(200);
    release();
    pull(200);
    release();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(haptics()).toHaveLength(1);

    await elapse(1000);
    pull(200);
    release();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("settles after a rejected handler and reports it", async () => {
    const failure = new Error("refresh failed");
    onRefresh("/", () => Promise.reject(failure));
    render(<PullToRefresh />);

    pull(200);
    release();
    await elapse(PULL_MIN_SPIN_MS);
    expect(phase()).toBe("idle");
    expect(recentErrors()).toEqual([{ error: failure, context: { kind: "rejection", source: "pull-to-refresh" } }]);
  });

  it("resets on a second finger", () => {
    const handler = onRefresh("/");
    render(<PullToRefresh />);

    pull(200);
    expect(phase()).toBe("armed");
    touch("touchstart", 300, 120);
    expect(phase()).toBe("idle");
    touch("touchmove", 400, 120);
    release();
    expect(handler).not.toHaveBeenCalled();

    touch("touchstart", 100, 120);
    touch("touchmove", 300, 320);
    expect(phase()).toBe("idle");
    release();
    expect(handler).not.toHaveBeenCalled();
  });

  it("resets when the page scrolls under the pull", () => {
    const handler = onRefresh("/");
    render(<PullToRefresh />);

    pull(200);
    expect(phase()).toBe("armed");
    vi.stubGlobal("scrollY", 5);
    touch("touchmove", 320);
    expect(phase()).toBe("idle");
    release();
    expect(handler).not.toHaveBeenCalled();
  });

  it("resets when the pull turns into a scroll up", () => {
    const handler = onRefresh("/");
    render(<PullToRefresh />);

    pull(200);
    expect(phase()).toBe("armed");
    touch("touchmove", 80);
    expect(phase()).toBe("idle");
    release();
    expect(handler).not.toHaveBeenCalled();
  });

  it("comes out from under the top bar", () => {
    onRefresh("/");
    const bar = document.createElement("header");
    bar.dataset.topbar = "search-list";
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({ bottom: 96 } as DOMRect);
    document.body.append(bar);
    render(<PullToRefresh />);

    touch("touchstart", 100);
    expect(indicator().style.top).toBe("96px");
  });

  it("stops listening when the address leaves the tab", () => {
    const handler = onRefresh("/");
    const removed = vi.spyOn(window, "removeEventListener");
    const { rerender } = render(<PullToRefresh />);

    address.pathname = "/map";
    rerender(<PullToRefresh />);
    expect(touchListeners(removed).map(([type]) => type)).toEqual(TOUCH_EVENTS);
    pull(200);
    release();
    expect(handler).not.toHaveBeenCalled();
  });
});
