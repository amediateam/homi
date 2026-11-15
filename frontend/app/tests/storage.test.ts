import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { restoreFromDeviceStorage, RESTORE_TIMEOUT_MS, STORAGE_POLICY, storageGet, storageSet } from "@/lib/storage";

let fake: FakeTelegram | null = null;

function deviceCalls(telegram: FakeTelegram): string[] {
  return telegram.calls.filter((call) => call.member.startsWith("DeviceStorage.")).map((call) => `${call.member} ${String(call.args[0])}`);
}

/** Lets the fake's asynchronous DeviceStorage callbacks run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  fake?.uninstall();
  fake = null;
  window.localStorage.clear();
});

describe("storage policy", () => {
  it("mirrors to DeviceStorage exactly the keys it restores (fix of LB-APP-012)", () => {
    expect(STORAGE_POLICY).toEqual({
      "homi-city": "synced",
      "homi-nudge": "synced",
      "homi-visits": "synced",
      "homi-home": "synced",
      "homi-new-pets": "synced",
      "homi-theme": "local",
      "homi-graphics": "local",
      "homi-graphics-measured": "local",
      "homi-map-engine": "local",
    });
  });

  it("writes a synced key to both stores and a local key to localStorage only (9.0)", async () => {
    fake = fakeTelegram({ version: "9.0" });

    storageSet("homi-visits", '{"abc":1}');
    storageSet("homi-theme", "dark");
    storageSet("homi-map-fit:41.3,69.2", "[41.3,69.2,12]");
    await flush();

    expect(storageGet("homi-visits")).toBe('{"abc":1}');
    expect(storageGet("homi-theme")).toBe("dark");
    expect(storageGet("homi-map-fit:41.3,69.2")).toBe("[41.3,69.2,12]");
    expect(deviceCalls(fake)).toEqual(["DeviceStorage.setItem homi-visits"]);
  });

  it("removes a key from both stores with null", async () => {
    fake = fakeTelegram({ version: "9.0" });
    storageSet("homi-city", "tashkent");
    storageSet("homi-city", null);
    await flush();

    expect(storageGet("homi-city")).toBeNull();
    expect(deviceCalls(fake)).toEqual(["DeviceStorage.setItem homi-city", "DeviceStorage.removeItem homi-city"]);
  });

  it("never calls DeviceStorage below 9.0", async () => {
    fake = fakeTelegram({ version: "8.0" });

    storageSet("homi-city", "tashkent");
    await restoreFromDeviceStorage();

    expect(deviceCalls(fake)).toEqual([]);
    expect(storageGet("homi-city")).toBe("tashkent");
  });

  it("refuses values that look like launch data or a bearer token", () => {
    for (const value of ["query_id=AAA&user=x", "x&auth_date=1700000000", "a&hash=00ff", "Bearer 1|abc", "12|" + "a".repeat(40)]) {
      storageSet("homi-nudge", value);
      expect(storageGet("homi-nudge"), value).toBeNull();
    }
  });

  it("keeps working when the browser refuses storage", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(() => storageSet("homi-theme", "dark")).not.toThrow();
    expect(storageGet("homi-theme")).toBeNull();
  });
});

describe("restoreFromDeviceStorage (fix of LB-APP-021)", () => {
  it("fills only the missing local keys, homi-visits included", async () => {
    fake = fakeTelegram({ version: "9.0" });
    fake.webApp.DeviceStorage.setItem("homi-visits", '{"h":5}');
    fake.webApp.DeviceStorage.setItem("homi-city", "samarkand");
    window.localStorage.setItem("homi-city", "tashkent");
    await flush();

    await restoreFromDeviceStorage();

    expect(storageGet("homi-visits")).toBe('{"h":5}');
    expect(storageGet("homi-city")).toBe("tashkent");
    expect(deviceCalls(fake).filter((call) => call.startsWith("DeviceStorage.getItem")).sort()).toEqual(
      ["homi-home", "homi-new-pets", "homi-nudge", "homi-visits"].map((key) => `DeviceStorage.getItem ${key}`).sort(),
    );
  });

  it("gives each key at most 1.5 s, all in parallel, and never rejects", async () => {
    vi.useFakeTimers();
    fake = fakeTelegram({ version: "9.0" });
    fake.webApp.DeviceStorage.getItem = (() => fake?.webApp.DeviceStorage) as typeof fake.webApp.DeviceStorage.getItem;
    let settled = false;
    const restoring = restoreFromDeviceStorage().then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await restoring;
    expect(settled).toBe(true);
    expect(RESTORE_TIMEOUT_MS).toBe(1500);
    vi.useRealTimers();
  });

  it("survives getItem throwing or answering with an error", async () => {
    fake = fakeTelegram({ version: "9.0" });
    fake.webApp.DeviceStorage.getItem = ((key: string, callback: (error: string | null, value?: string | null) => void) => {
      if (key === "homi-visits") {
        throw new Error("bridge gone");
      }
      queueMicrotask(() => callback("STORAGE_ERROR", null));
      return fake?.webApp.DeviceStorage;
    }) as typeof fake.webApp.DeviceStorage.getItem;

    await expect(restoreFromDeviceStorage()).resolves.toBeUndefined();
    expect(storageGet("homi-visits")).toBeNull();
  });

  it("does not restore a stored value that looks like launch data", async () => {
    fake = fakeTelegram({ version: "9.0" });
    fake.webApp.DeviceStorage.setItem("homi-nudge", "query_id=AAA&hash=00");
    await flush();

    await restoreFromDeviceStorage();

    expect(storageGet("homi-nudge")).toBeNull();
  });
});
