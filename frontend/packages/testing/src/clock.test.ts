import { afterEach, describe, expect, it, vi } from "vitest";

import { freezeClock } from "./clock";

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

/**
 * CI runs this file with `TZ=UTC` and with `TZ=Asia/Tashkent` (`15` §3.10). The frozen instant is the same in both;
 * only the local fields differ.
 */
describe("freezeClock", () => {
  it("fixes Date at the given UTC instant", () => {
    restore = freezeClock("2026-11-15T19:30:00Z");

    expect(new Date().toISOString()).toBe("2026-11-15T19:30:00.000Z");
    expect(Date.now()).toBe(Date.parse("2026-11-15T19:30:00Z"));
  });

  it("shows the local hour of the process time zone", () => {
    restore = freezeClock("2026-11-15T19:30:00Z");

    const expectedHour = process.env.TZ === "Asia/Tashkent" ? 0 : 19;
    expect(new Date().getHours()).toBe(expectedHour);
  });

  it("holds timers until the test advances them", () => {
    restore = freezeClock("2026-11-15T19:30:00Z");
    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 1_000);

    expect(fired).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(fired).toBe(true);
    expect(new Date().toISOString()).toBe("2026-11-15T19:30:01.000Z");
  });

  it("refuses a timestamp that is not UTC", () => {
    expect(() => freezeClock("2026-11-15T19:30:00+05:00")).toThrow('ending in "Z"');
  });

  it("gives the real clock back", () => {
    freezeClock("2000-01-01T00:00:00Z")();

    expect(new Date().getFullYear()).toBeGreaterThan(2000);
  });
});
