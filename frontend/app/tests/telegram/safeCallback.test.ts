import { fakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeCallback } from "@/lib/telegram/sdk";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("safeCallback (TMA-044)", () => {
  it("a throwing handler does not break the next event, and its error is rethrown once on a zero timeout", () => {
    const telegram = fakeTelegram();
    const seen: number[] = [];
    let calls = 0;
    const handler = safeCallback(() => {
      calls += 1;
      seen.push(calls);
      if (calls === 1) {
        throw new Error("boom");
      }
    });
    telegram.webApp.onEvent("themeChanged", handler);

    expect(() => telegram.emit("themeChanged")).not.toThrow();
    telegram.emit("themeChanged");
    expect(seen).toEqual([1, 2]);

    expect(() => vi.advanceTimersByTime(0)).toThrow("boom");
    expect(() => vi.advanceTimersByTime(10)).not.toThrow();
    telegram.uninstall();
  });

  it("passes the arguments and the receiver through", () => {
    const received: unknown[] = [];
    const receiver = { name: "BackButton" };
    const handler = safeCallback(function (this: unknown, ...args: unknown[]) {
      received.push(this, ...args);
    });

    handler.call(receiver, 1, "two");

    expect(received).toEqual([receiver, 1, "two"]);
  });
});
