import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOME_SCREEN_TIMEOUT_MS, tg } from "@/lib/telegram";

let fake: FakeTelegram | null = null;
const members = () => (fake?.calls ?? []).map((entry) => entry.member);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
});

describe("haptics (TMA-025)", () => {
  it("maps impact, success and error to HapticFeedback", () => {
    fake = fakeTelegram();
    tg.haptic.impact();
    tg.haptic.impact("heavy");
    tg.haptic.success();
    tg.haptic.error();
    expect(fake.calls.filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`)).toEqual([
      "HapticFeedback.impactOccurred(light)",
      "HapticFeedback.impactOccurred(heavy)",
      "HapticFeedback.notificationOccurred(success)",
      "HapticFeedback.notificationOccurred(error)",
    ]);
  });
});

describe("confirm (TMA-026)", () => {
  it("uses showConfirm from 6.2", async () => {
    fake = fakeTelegram({ version: "6.2", answers: { confirm: false } });
    await expect(tg.confirm("Удалить?")).resolves.toBe(false);
    expect(members()).toContain("showConfirm");
  });

  it("falls back to window.confirm below 6.2 and outside Telegram", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fake = fakeTelegram({ version: "6.1" });
    await expect(tg.confirm("Удалить?")).resolves.toBe(true);
    expect(members()).not.toContain("showConfirm");
    fake.uninstall();
    fake = null;
    await expect(tg.confirm("Ещё?")).resolves.toBe(true);
    expect(confirm.mock.calls).toEqual([["Удалить?"], ["Ещё?"]]);
  });
});

describe("requestWriteAccess (TMA-033)", () => {
  it("answers from 6.9 and is null below it or outside Telegram", async () => {
    await expect(tg.requestWriteAccess()).resolves.toBeNull();
    fake = fakeTelegram({ version: "6.2" });
    await expect(tg.requestWriteAccess()).resolves.toBeNull();
    fake.uninstall();
    fake = fakeTelegram({ version: "6.9", answers: { writeAccess: false } });
    await expect(tg.requestWriteAccess()).resolves.toBe(false);
  });
});

describe("home screen (TMA-036)", () => {
  it("reads the status from 8.0, unknown after 1.5 s, unsupported below", async () => {
    await expect(tg.homeScreen.status()).resolves.toBe("unsupported");
    fake = fakeTelegram({ version: "8.0", answers: { homeScreenStatus: "added" } });
    await expect(tg.homeScreen.status()).resolves.toBe("added");

    fake.webApp.checkHomeScreenStatus = () => undefined;
    const pending = tg.homeScreen.status();
    await vi.advanceTimersByTimeAsync(HOME_SCREEN_TIMEOUT_MS);
    await expect(pending).resolves.toBe("unknown");
    expect(HOME_SCREEN_TIMEOUT_MS).toBe(1500);
  });

  it("adds and reports homeScreenAdded", () => {
    fake = fakeTelegram({ version: "8.0" });
    const added = vi.fn();
    const off = tg.homeScreen.onAdded(added);
    tg.homeScreen.add();
    fake.emit("homeScreenAdded");
    off();
    fake.emit("homeScreenAdded");
    expect(members()).toContain("addToHomeScreen");
    expect(added).toHaveBeenCalledTimes(1);
  });
});

describe("buttons (TMA-022, TMA-023)", () => {
  it("BackButton shows, hides and takes one click handler", () => {
    fake = fakeTelegram();
    const handler = vi.fn();
    const off = tg.backButton.onClick(handler);
    tg.backButton.setVisible(true);
    expect(fake.webApp.BackButton.isVisible).toBe(true);
    fake.emit("backButtonClicked");
    off();
    fake.emit("backButtonClicked");
    tg.backButton.setVisible(false);
    expect(fake.webApp.BackButton.isVisible).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("SettingsButton exists from 7.0 only", () => {
    fake = fakeTelegram({ version: "6.9" });
    expect(tg.settingsButton.available()).toBe(false);
    tg.settingsButton.setVisible(true);
    tg.settingsButton.onClick(() => undefined);
    expect(members().filter((member) => member.startsWith("SettingsButton"))).toEqual([]);

    fake.uninstall();
    fake = fakeTelegram({ version: "7.0" });
    tg.settingsButton.setVisible(true);
    expect(fake.webApp.SettingsButton.isVisible).toBe(true);
  });
});

describe("platform, version, close and visibility (TMA-039 … TMA-042)", () => {
  it("reads the platform, the version and the gates from the SDK", () => {
    fake = fakeTelegram({ version: "7.7", platform: "android" });
    expect([tg.platform(), tg.version()]).toEqual(["android", "7.7"]);
    expect(tg.isVersionAtLeast("7.7")).toBe(true);
    expect(tg.supports("fullscreen")).toBe(false);
    tg.close();
    expect(fake.closed).toBe(true);
  });

  it("reads the Android performance class from the User-Agent", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14) Telegram-Android/11.2.3 (Pixel; Android 14; SDK 34; AVERAGE)");
    expect(tg.performanceClass()).toBe("AVERAGE");
    expect(tg.isAndroid()).toBe(true);
  });

  it("onVisible and onHidden follow document.visibilitychange", () => {
    const visible = vi.fn();
    const hidden = vi.fn();
    const offVisible = tg.onVisible(visible);
    const offHidden = tg.onHidden(hidden);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    offVisible();
    offHidden();
    document.dispatchEvent(new Event("visibilitychange"));
    expect([visible.mock.calls.length, hidden.mock.calls.length]).toEqual([1, 1]);
  });
});

describe("outside Telegram (TMA-043)", () => {
  it("every member is a no-op or a neutral answer and never throws", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(tg.initData()).toBe("");
    expect(tg.hasInitData()).toBe(false);
    expect(tg.platform()).toBe("unknown");
    expect(tg.version()).toBe("");
    expect(tg.isVersionAtLeast("6.0")).toBe(false);
    expect(tg.supports("confirm")).toBe(false);
    expect(() => {
      tg.haptic.impact();
      tg.haptic.success();
      tg.haptic.error();
      tg.backButton.setVisible(true);
      tg.backButton.onClick(() => undefined)();
      tg.settingsButton.setVisible(true);
      tg.settingsButton.onClick(() => undefined)();
      tg.homeScreen.add();
      tg.homeScreen.onAdded(() => undefined)();
      tg.close();
    }).not.toThrow();
    expect(tg.deviceStorage.available()).toBe(false);
    await expect(tg.deviceStorage.getItem("homi-city")).resolves.toBeNull();
    await expect(tg.shareMessage("x")).resolves.toBe(false);
    await expect(tg.homeScreen.status()).resolves.toBe("unsupported");
    await expect(tg.requestWriteAccess()).resolves.toBeNull();
  });
});

describe("the adapter is the only reader of window.Telegram (DEC-44)", () => {
  it("no file outside lib/telegram/sdk.ts and the boot and dev scripts mentions window.Telegram", () => {
    const root = join(import.meta.dirname, "../..");
    const allowed = new Set(["lib/telegram/sdk.ts", "lib/telegram/types.ts", "boot/boot.js", "boot/stubs.js", "boot/inline.generated.ts", "dev/telegram-emulator.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", "tests", "e2e", "public"].includes(name)) {
          continue;
        }
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (/\.(ts|tsx|js|mjs)$/.test(name) && /window\.Telegram\.|Telegram\.WebApp|TelegramWebviewProxy/.test(readFileSync(path, "utf8"))) {
          const file = relative(root, path);
          if (!allowed.has(file)) {
            offenders.push(file);
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
