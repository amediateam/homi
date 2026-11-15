import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocation, LOCATION_TIMEOUT_MS, locationAvailable } from "@/lib/telegram/location";

let fake: FakeTelegram | null = null;
const members = () => (fake?.calls ?? []).map((entry) => entry.member);

function stubGeolocation(answer: (success: PositionCallback, failure: PositionErrorCallback, options?: PositionOptions) => void) {
  const getCurrentPosition = vi.fn(answer);
  vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
});

describe("location (TMA-035)", () => {
  it("uses LocationManager from 8.0", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { location: { latitude: 41.31, longitude: 69.24, horizontal_accuracy: 20 } } });
    expect(locationAvailable()).toBe(true);

    const result = getLocation();
    await vi.advanceTimersByTimeAsync(0);

    await expect(result).resolves.toEqual({ lat: 41.31, lon: 69.24, accuracy: 20 });
    expect(members()).toEqual(expect.arrayContaining(["LocationManager.init", "LocationManager.getLocation"]));
  });

  it("a manager that never answers gives fail after 12 s (fix of LB-APP-009)", async () => {
    fake = fakeTelegram({ version: "8.0" });
    fake.webApp.LocationManager.getLocation = (() => fake?.webApp.LocationManager) as typeof fake.webApp.LocationManager.getLocation;

    const result = getLocation();
    await vi.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("fail");
    expect(LOCATION_TIMEOUT_MS).toBe(12_000);
  });

  it("a refusal is denied, and once requested and not granted it stays denied without a new request", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { location: null } });
    const first = getLocation();
    await vi.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toBe("denied");
    const requests = members().filter((member) => member === "LocationManager.getLocation").length;

    await expect(getLocation()).resolves.toBe("denied");
    expect(members().filter((member) => member === "LocationManager.getLocation")).toHaveLength(requests);
  });

  it("below 8.0 takes the browser path with high accuracy, 12 s and a 60 s maximum age", async () => {
    fake = fakeTelegram({ version: "7.10" });
    const getCurrentPosition = stubGeolocation((success) =>
      success({ coords: { latitude: 1, longitude: 2, accuracy: 5 } } as GeolocationPosition),
    );

    await expect(getLocation()).resolves.toEqual({ lat: 1, lon: 2, accuracy: 5 });
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
    expect(members()).not.toContain("LocationManager.init");
  });

  it("the browser path maps PERMISSION_DENIED to denied and anything else to fail", async () => {
    stubGeolocation((_, failure) => failure({ code: 1 } as GeolocationPositionError));
    await expect(getLocation()).resolves.toBe("denied");
    stubGeolocation((_, failure) => failure({ code: 3 } as GeolocationPositionError));
    await expect(getLocation()).resolves.toBe("fail");
  });

  it("a second call while one is pending shares its promise", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { location: { latitude: 1, longitude: 2 } } });
    const first = getLocation();
    const second = getLocation();

    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(0);
    await first;
    expect(members().filter((member) => member === "LocationManager.getLocation")).toHaveLength(1);
  });

  it("is unavailable outside Telegram without browser geolocation", async () => {
    vi.stubGlobal("navigator", { ...navigator, geolocation: undefined });
    expect(locationAvailable()).toBe(false);
    await expect(getLocation()).resolves.toBe("fail");
  });
});
