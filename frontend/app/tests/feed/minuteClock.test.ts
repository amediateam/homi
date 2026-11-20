import { freezeClock } from "@homi/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentMinute, subscribeMinute } from "@/features/feed/minuteClock";

let restore: (() => void) | null = null;
const stops: (() => void)[] = [];

const listen = () => {
  const listener = vi.fn();
  stops.push(subscribeMinute(listener));
  return listener;
};

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  restore?.();
  restore = null;
});

describe("the minute clock (BR-APP-109, legacy minuteClock.js)", () => {
  it("is the minute of the device clock, read at once without a listener", () => {
    restore = freezeClock("2026-11-14T06:45:50Z");

    expect(currentMinute()).toBe(Math.floor(Date.parse("2026-11-14T06:45:50Z") / 60_000));
    vi.setSystemTime(new Date("2026-11-14T06:46:00Z"));
    expect(currentMinute()).toBe(Math.floor(Date.parse("2026-11-14T06:46:00Z") / 60_000));
  });

  it("runs no timer without a listener", () => {
    restore = freezeClock("2026-11-14T06:45:50Z");

    expect(vi.getTimerCount()).toBe(0);
    const listener = listen();
    expect(vi.getTimerCount()).toBe(1);
    listen();
    expect(vi.getTimerCount()).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("checks every 15 s and tells its listeners only of a new minute", () => {
    restore = freezeClock("2026-11-14T06:45:20Z");
    const first = listen();
    const second = listen();

    vi.advanceTimersByTime(30_000);
    expect(first).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(45_000);
    expect(first).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("checks at once when the app becomes visible", () => {
    restore = freezeClock("2026-11-14T06:45:20Z");
    const listener = listen();

    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-11-14T06:47:01Z"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("the last listener to leave stops the interval and the visibility check", () => {
    restore = freezeClock("2026-11-14T06:45:20Z");
    const listener = listen();
    const other = subscribeMinute(vi.fn());

    other();
    expect(vi.getTimerCount()).toBe(1);
    stops.splice(0).forEach((stop) => stop());
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime(new Date("2026-11-14T06:50:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(60_000);
    expect(listener).not.toHaveBeenCalled();
  });

  it("a listener that comes after a quiet while starts from the minute it came in", () => {
    restore = freezeClock("2026-11-14T06:45:20Z");
    const stop = subscribeMinute(vi.fn());
    stop();

    vi.setSystemTime(new Date("2026-11-14T07:10:20Z"));
    const listener = listen();
    vi.advanceTimersByTime(15_000);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
