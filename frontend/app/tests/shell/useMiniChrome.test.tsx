import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { expandChrome, MINI_CHROME_DELTA_PX, MINI_CHROME_TOP_ZONE_PX, useMiniChrome } from "@/features/shell/useMiniChrome";

let fake: FakeTelegram | null = null;
let frames: FrameRequestCallback[] = [];

const collapsed = () => document.documentElement.classList.contains("chrome-mini");
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

/** Puts the page at `y`, fires the scroll event and runs the frame it asked for. */
function scrollTo(y: number) {
  vi.stubGlobal("scrollY", y);
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    const pending = frames;
    frames = [];
    for (const frame of pending) {
      frame(0);
    }
  });
}

function Chrome({ enabled }: { enabled: boolean }) {
  useMiniChrome(enabled);
  return null;
}

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("scrollY", 0);
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("chrome-mini");
  fake?.uninstall();
  fake = null;
});

describe("useMiniChrome (03 §1.2)", () => {
  it("collapses after more than 24 px down past the turning point and expands after more than 24 px up", () => {
    vi.stubGlobal("scrollY", 200);
    render(<Chrome enabled />);

    scrollTo(200 + MINI_CHROME_DELTA_PX);
    expect(collapsed()).toBe(false);
    scrollTo(200 + MINI_CHROME_DELTA_PX + 1);
    expect(collapsed()).toBe(true);

    scrollTo(400);
    scrollTo(400 - MINI_CHROME_DELTA_PX);
    expect(collapsed()).toBe(true);
    scrollTo(400 - MINI_CHROME_DELTA_PX - 1);
    expect(collapsed()).toBe(false);
  });

  it("keeps the legacy thresholds: 24 px each way, 60 px at the top (literal values)", () => {
    vi.stubGlobal("scrollY", 200);
    const view = render(<Chrome enabled />);
    scrollTo(224);
    expect(collapsed()).toBe(false);
    scrollTo(225);
    expect(collapsed()).toBe(true);
    scrollTo(201);
    expect(collapsed()).toBe(true);
    scrollTo(200);
    expect(collapsed()).toBe(false);
    view.unmount();

    vi.stubGlobal("scrollY", 50);
    render(<Chrome enabled />);
    scrollTo(80);
    expect(collapsed()).toBe(true);
    scrollTo(61);
    expect(collapsed()).toBe(true);
    scrollTo(59);
    expect(collapsed()).toBe(false);
  });

  it("measures from the highest point while expanded and the lowest while collapsed", () => {
    vi.stubGlobal("scrollY", 300);
    render(<Chrome enabled />);

    scrollTo(250);
    scrollTo(270);
    expect(collapsed()).toBe(false);
    scrollTo(275);
    expect(collapsed()).toBe(true);

    scrollTo(500);
    scrollTo(480);
    expect(collapsed()).toBe(true);
    scrollTo(475);
    expect(collapsed()).toBe(false);
  });

  it("is always expanded within 60 px of the top", () => {
    render(<Chrome enabled />);

    scrollTo(MINI_CHROME_TOP_ZONE_PX - 1);
    expect(collapsed()).toBe(false);
    scrollTo(MINI_CHROME_TOP_ZONE_PX + MINI_CHROME_DELTA_PX + 1);
    expect(collapsed()).toBe(true);

    scrollTo(MINI_CHROME_TOP_ZONE_PX + MINI_CHROME_DELTA_PX - 10);
    expect(collapsed()).toBe(true);
    scrollTo(MINI_CHROME_TOP_ZONE_PX - 1);
    expect(collapsed()).toBe(false);
  });

  it("reads the scroll once per frame", () => {
    render(<Chrome enabled />);
    vi.stubGlobal("scrollY", 300);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });
    expect(frames).toHaveLength(1);
  });

  it("does nothing while disabled", () => {
    render(<Chrome enabled={false} />);
    scrollTo(500);
    expect(frames).toHaveLength(0);
    expect(collapsed()).toBe(false);
  });

  it("a frame queued just before the list is left never runs", () => {
    const queued = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      id += 1;
      queued.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (frame: number) => queued.delete(frame));
    const view = render(<Chrome enabled />);

    vi.stubGlobal("scrollY", 500);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(queued.size).toBe(1);
    view.rerender(<Chrome enabled={false} />);
    expect(queued.size).toBe(0);
    act(() => {
      for (const frame of queued.values()) {
        frame(0);
      }
    });
    expect(collapsed()).toBe(false);
  });

  it("cleanup removes the listener and the class (leaving the list, a hidden route)", () => {
    const removed = vi.spyOn(window, "removeEventListener");
    const view = render(<Chrome enabled />);
    scrollTo(500);
    expect(collapsed()).toBe(true);

    view.rerender(<Chrome enabled={false} />);
    expect(collapsed()).toBe(false);
    expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function));
    scrollTo(100);
    scrollTo(900);
    expect(collapsed()).toBe(false);

    view.rerender(<Chrome enabled />);
    scrollTo(1000);
    expect(collapsed()).toBe(true);
    view.unmount();
    expect(collapsed()).toBe(false);
  });
});

describe("expandChrome", () => {
  it("expands collapsed chrome with a light impact and returns true", () => {
    render(<Chrome enabled />);
    scrollTo(500);
    expect(collapsed()).toBe(true);

    let result: boolean | undefined;
    act(() => {
      result = expandChrome();
    });
    expect(result).toBe(true);
    expect(collapsed()).toBe(false);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });

  it("returns false without a haptic when the chrome is expanded", () => {
    render(<Chrome enabled />);
    expect(expandChrome()).toBe(false);
    expect(haptics()).toEqual([]);
  });

  it("moves the turning point to where the page is", () => {
    render(<Chrome enabled />);
    scrollTo(500);
    act(() => {
      expandChrome();
    });

    scrollTo(500 + MINI_CHROME_DELTA_PX);
    expect(collapsed()).toBe(false);
    scrollTo(500 + MINI_CHROME_DELTA_PX + 1);
    expect(collapsed()).toBe(true);
  });
});
