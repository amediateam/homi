import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyGraphicsMode,
  getGraphicsMode,
  isLiteGraphics,
  isLowEndDevice,
  judgeFrameIntervals,
  measureScrollPerformance,
  setGraphicsMode,
  type DeviceProfile,
} from "@/lib/graphics";
import { storageGet, storageSet } from "@/lib/storage";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const telegramAndroid = (performance: string) => `${ANDROID} Telegram-Android/11.2.3 (Google Pixel 8; Android 14; SDK 34; ${performance})`;

function profile(userAgent: string, cores?: number, memory?: number): DeviceProfile {
  return { userAgent, cores, memory };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
});

describe("isLowEndDevice (03 §1.7)", () => {
  it("follows the Telegram-Android performance class when the User-Agent has one", () => {
    expect(isLowEndDevice(profile(telegramAndroid("LOW"), 8, 8))).toBe(true);
    expect(isLowEndDevice(profile(telegramAndroid("AVERAGE"), 8, 8))).toBe(true);
    expect(isLowEndDevice(profile(telegramAndroid("HIGH"), 2, 1))).toBe(false);
  });

  it("else marks Android with at most 4 cores or 3 GB; missing values count as 8", () => {
    expect(isLowEndDevice(profile(ANDROID, 4, 8))).toBe(true);
    expect(isLowEndDevice(profile(ANDROID, 8, 3))).toBe(true);
    expect(isLowEndDevice(profile(ANDROID, 5, 4))).toBe(false);
    expect(isLowEndDevice(profile(ANDROID))).toBe(false);
    expect(isLowEndDevice(profile(ANDROID, undefined, 2))).toBe(true);
  });

  it("never marks iOS or a desktop", () => {
    expect(isLowEndDevice(profile(IPHONE, 2, 1))).toBe(false);
    expect(isLowEndDevice(profile(DESKTOP, 2, 1))).toBe(false);
  });
});

describe("graphics mode", () => {
  it("auto follows the device and the measured key; an explicit choice wins", () => {
    const lowEnd = profile(ANDROID, 2, 2);
    const strong = profile(ANDROID, 8, 8);
    expect(getGraphicsMode()).toBe("auto");
    expect(isLiteGraphics(lowEnd)).toBe(true);
    expect(isLiteGraphics(strong)).toBe(false);

    storageSet("homi-graphics-measured", "lite");
    expect(isLiteGraphics(strong)).toBe(true);

    storageSet("homi-graphics", "full");
    expect(getGraphicsMode()).toBe("full");
    expect(isLiteGraphics(lowEnd)).toBe(false);

    storageSet("homi-graphics", "lite");
    expect(isLiteGraphics(profile(IPHONE))).toBe(true);
  });

  it("an unknown stored value is auto", () => {
    window.localStorage.setItem("homi-graphics", "ultra");
    expect(getGraphicsMode()).toBe("auto");
  });

  it("applyGraphicsMode toggles html.lite", () => {
    applyGraphicsMode(profile(ANDROID, 2, 2));
    expect(document.documentElement.classList.contains("lite")).toBe(true);
    applyGraphicsMode(profile(IPHONE));
    expect(document.documentElement.classList.contains("lite")).toBe(false);
  });

  it("setGraphicsMode('auto') clears both keys", () => {
    storageSet("homi-graphics", "lite");
    storageSet("homi-graphics-measured", "lite");

    setGraphicsMode("auto");

    expect(storageGet("homi-graphics")).toBeNull();
    expect(storageGet("homi-graphics-measured")).toBeNull();
  });

  it("setGraphicsMode stores an explicit choice and applies it", () => {
    setGraphicsMode("lite");
    expect(storageGet("homi-graphics")).toBe("lite");
    expect(document.documentElement.classList.contains("lite")).toBe(true);
  });
});

describe("scroll measurement", () => {
  const intervals = (slow: number) => [...Array.from({ length: slow }, () => 40), ...Array.from({ length: 150 - slow }, () => 16)];

  it("turns lite on when at least 20 % of 150 frame intervals exceed 28 ms", () => {
    expect(judgeFrameIntervals(intervals(30))).toBe(true);
    expect(judgeFrameIntervals(intervals(29))).toBe(false);
    expect(judgeFrameIntervals([...intervals(0).slice(1), 28])).toBe(false);
  });

  it("measures 150 intervals on Android in auto and stores the result", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    const result = measureScrollPerformance(profile(ANDROID, 8, 8));
    let time = 0;
    for (let frame = 0; frame <= 150; frame++) {
      time += frame <= 30 ? 40 : 16;
      frames.shift()?.(time);
    }

    await expect(result).resolves.toBe("lite");
    expect(storageGet("homi-graphics-measured")).toBe("lite");
    expect(document.documentElement.classList.contains("lite")).toBe(true);
  });

  it("does not measure on iOS, with an explicit choice, or when lite is already on", async () => {
    await expect(measureScrollPerformance(profile(IPHONE))).resolves.toBe("skipped");
    storageSet("homi-graphics", "full");
    await expect(measureScrollPerformance(profile(ANDROID, 8, 8))).resolves.toBe("skipped");
    storageSet("homi-graphics", null);
    await expect(measureScrollPerformance(profile(ANDROID, 2, 2))).resolves.toBe("skipped");
  });
});
