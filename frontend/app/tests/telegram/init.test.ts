import { fakeTelegram, type FakeTelegram, type FakeTelegramOptions } from "@homi/testing";
import { afterEach, describe, expect, it } from "vitest";

import { initTelegramApp } from "@/lib/telegram/init";

let fake: FakeTelegram | null = null;

function launch(options: FakeTelegramOptions): FakeTelegram {
  fake?.uninstall();
  fake = fakeTelegram(options);
  return fake;
}

const members = (telegram: FakeTelegram) => telegram.calls.map((call) => call.member);

afterEach(() => {
  fake?.uninstall();
  fake = null;
  document.documentElement.className = "";
});

describe("initTelegramApp (TMA-014 … TMA-016)", () => {
  it("calls ready() and expand() once, however often it runs", () => {
    const telegram = launch({ version: "6.0" });

    initTelegramApp();
    initTelegramApp();

    expect(members(telegram).filter((member) => member === "ready" || member === "expand")).toEqual(["ready", "expand"]);
  });

  it("runs again for a new SDK object (a late SDK)", () => {
    initTelegramApp();
    const late = launch({ version: "6.0" });

    initTelegramApp();

    expect(members(late)).toContain("ready");
  });

  it("disables vertical swipes from 7.7 only", () => {
    const old = launch({ version: "7.0" });
    initTelegramApp();
    expect(members(old)).not.toContain("disableVerticalSwipes");

    const current = launch({ version: "7.7" });
    initTelegramApp();
    expect(members(current)).toContain("disableVerticalSwipes");
    expect(current.webApp.isVerticalSwipesEnabled).toBe(false);
  });

  it("requests fullscreen from 8.0 on ios, android and android_x only", () => {
    for (const platform of ["ios", "android", "android_x"] as const) {
      const telegram = launch({ version: "8.0", platform });
      initTelegramApp();
      expect(members(telegram), platform).toContain("requestFullscreen");
    }
    for (const [version, platform] of [
      ["8.0", "tdesktop"],
      ["8.0", "weba"],
      ["7.10", "ios"],
    ] as const) {
      const telegram = launch({ version, platform });
      initTelegramApp();
      expect(members(telegram), `${version} ${platform}`).not.toContain("requestFullscreen");
    }
  });

  it("html.fullscreen follows isFullscreen and fullscreenChanged", async () => {
    const telegram = launch({ version: "8.0", platform: "android" });
    initTelegramApp();
    await Promise.resolve();
    expect(document.documentElement.classList.contains("fullscreen")).toBe(true);

    telegram.webApp.exitFullscreen();
    await Promise.resolve();
    expect(document.documentElement.classList.contains("fullscreen")).toBe(false);
  });

  it("a refused fullscreen request does not stop the rest", () => {
    const telegram = launch({ version: "8.0", platform: "ios" });
    telegram.webApp.requestFullscreen = () => {
      throw new Error("WebAppFullscreenFailed");
    };

    expect(() => initTelegramApp()).not.toThrow();
    expect(members(telegram)).toContain("disableVerticalSwipes");
  });

  it("applies the theme of the client and follows themeChanged (TMA-019)", () => {
    const telegram = launch({ version: "8.0", platform: "tdesktop", colorScheme: "dark" });
    initTelegramApp();
    expect(document.documentElement.dataset.scheme).toBe("dark");

    (telegram.webApp as { colorScheme: string }).colorScheme = "light";
    telegram.emit("themeChanged");
    expect(document.documentElement.dataset.scheme).toBe("light");
  });

  it("is a no-op outside Telegram", () => {
    expect(() => initTelegramApp()).not.toThrow();
    expect(document.documentElement.classList.contains("fullscreen")).toBe(false);
  });
});
