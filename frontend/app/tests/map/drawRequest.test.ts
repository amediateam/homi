import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeDrawRequest, DRAW_REQUEST_MS, requestDraw } from "@/lib/ui/shellState";

afterEach(() => {
  consumeDrawRequest();
  vi.useRealTimers();
});

describe("the draw request of the filters sheet (WP-28 \"Drawing layer\")", () => {
  it("is consumed once", () => {
    requestDraw();

    expect(consumeDrawRequest()).toBe(true);
    expect(consumeDrawRequest()).toBe(false);
  });

  it("is false without a request", () => {
    expect(consumeDrawRequest()).toBe(false);
  });

  it("is false once 3 s have passed, and cleared all the same", () => {
    vi.useFakeTimers();
    expect(DRAW_REQUEST_MS).toBe(3000);

    requestDraw();
    vi.advanceTimersByTime(DRAW_REQUEST_MS - 1);
    expect(consumeDrawRequest()).toBe(true);

    const requested = Date.now();
    requestDraw();
    vi.advanceTimersByTime(DRAW_REQUEST_MS);
    expect(consumeDrawRequest()).toBe(false);
    // Back at the time of the request: the stale request was cleared, not kept.
    vi.setSystemTime(requested);
    expect(consumeDrawRequest()).toBe(false);
  });

  it("a later request starts the 3 s again", () => {
    vi.useFakeTimers();
    requestDraw();
    vi.advanceTimersByTime(2000);
    requestDraw();
    vi.advanceTimersByTime(2000);

    expect(consumeDrawRequest()).toBe(true);
  });
});
