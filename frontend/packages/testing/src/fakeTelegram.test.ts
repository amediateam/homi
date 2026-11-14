import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeTelegram, type FakeTelegram, type FakeTelegramWindow } from "./fakeTelegram";
import { SYNTHETIC_HASH } from "./initData";

let fake: FakeTelegram | undefined;
const host = window as unknown as FakeTelegramWindow;

function install(options: Parameters<typeof fakeTelegram>[0] = {}): FakeTelegram {
  fake = fakeTelegram(options);
  return fake;
}

afterEach(() => {
  fake?.uninstall();
  fake = undefined;
});

/** Calls that need a version gate (`05` TMA-042), each made the way the app makes it. */
const gatedCalls = {
  "BackButton.show": (f: FakeTelegram) => f.webApp.BackButton.show(),
  "SettingsButton.show": (f: FakeTelegram) => f.webApp.SettingsButton.show(),
  showConfirm: (f: FakeTelegram) => f.webApp.showConfirm("Очистить историю?"),
  requestWriteAccess: (f: FakeTelegram) => f.webApp.requestWriteAccess(),
  shareMessage: (f: FakeTelegram) => f.webApp.shareMessage("prepared-1"),
  "LocationManager.init": (f: FakeTelegram) => f.webApp.LocationManager.init(),
  "DeviceStorage.setItem": (f: FakeTelegram) => f.webApp.DeviceStorage.setItem("kv-city", "tashkent"),
  checkHomeScreenStatus: (f: FakeTelegram) => f.webApp.checkHomeScreenStatus(),
} as const;

/** The first client version that supports each call; `null` means no gate (TMA-042). */
const firstVersion: Record<keyof typeof gatedCalls, string | null> = {
  "BackButton.show": null,
  "SettingsButton.show": "7.0",
  showConfirm: "6.2",
  requestWriteAccess: "6.9",
  shareMessage: "8.0",
  "LocationManager.init": "8.0",
  "DeviceStorage.setItem": "9.0",
  checkHomeScreenStatus: "8.0",
};

const versions = ["6.0", "6.1", "6.2", "6.9", "7.0", "7.7", "8.0", "9.0"];

function supported(version: string, since: string | null): boolean {
  if (since === null) {
    return true;
  }
  const [major, minor] = version.split(".").map(Number);
  const [sinceMajor, sinceMinor] = since.split(".").map(Number);
  return major > sinceMajor || (major === sinceMajor && minor >= sinceMinor);
}

const gateTable = versions.flatMap((version) =>
  (Object.keys(gatedCalls) as (keyof typeof gatedCalls)[]).map((member) => ({
    version,
    member,
    allowed: supported(version, firstVersion[member]),
  })),
);

describe("fakeTelegram version gates (TMA-042)", () => {
  it.each(gateTable)("$member on Telegram $version: allowed = $allowed", ({ version, member, allowed }) => {
    const f = install({ version });
    const call = () => gatedCalls[member](f);

    if (allowed) {
      expect(call).not.toThrow();
    } else {
      expect(call).toThrow(`WebAppMethodUnsupported: ${member} needs Telegram ${firstVersion[member]}`);
    }
  });

  it("answers isVersionAtLeast for the configured version", () => {
    const f = install({ version: "7.7" });

    expect(f.webApp.isVersionAtLeast("7.0")).toBe(true);
    expect(f.webApp.isVersionAtLeast("7.7")).toBe(true);
    expect(f.webApp.isVersionAtLeast("8.0")).toBe(false);
  });

  it("allows key colours from 6.1 and exact hex colours only from 6.9", () => {
    const f = install({ version: "6.2" });

    expect(() => f.webApp.setHeaderColor("bg_color")).not.toThrow();
    expect(() => f.webApp.setBackgroundColor("#1c1c1d")).toThrow("WebAppMethodUnsupported");
  });

  it("refuses vertical swipes before 7.7 and fullscreen before 8.0", () => {
    const f = install({ version: "7.0" });

    expect(() => f.webApp.disableVerticalSwipes()).toThrow("disableVerticalSwipes needs Telegram 7.7");
    expect(() => f.webApp.requestFullscreen()).toThrow("requestFullscreen needs Telegram 8.0");
  });
});

describe("fakeTelegram client state", () => {
  it("installs window.Telegram.WebApp with the configured client", () => {
    const f = install({ version: "8.0", platform: "android", colorScheme: "dark", startParam: "l_42" });

    expect(host.Telegram?.WebApp).toBe(f.webApp);
    expect(f.webApp.version).toBe("8.0");
    expect(f.webApp.platform).toBe("android");
    expect(f.webApp.colorScheme).toBe("dark");
    expect(f.webApp.initDataUnsafe.start_param).toBe("l_42");
    expect(f.webApp.initDataUnsafe.user?.first_name).toBe("Test");
    expect(new URLSearchParams(f.webApp.initData).get("hash")).toBe(SYNTHETIC_HASH);
  });

  it("removes itself on uninstall", () => {
    install().uninstall();
    fake = undefined;

    expect(host.Telegram).toBeUndefined();
  });

  it("refuses initData and startParam together, because startParam is part of initData", () => {
    expect(() => install({ initData: "hash=x", startParam: "l_1" })).toThrow("startParam");
  });

  it("refuses links that a real client refuses", () => {
    const f = install();

    expect(() => f.webApp.openLink("javascript:alert(1)")).toThrow("WebAppTgUrlInvalid");
    expect(() => f.webApp.openTelegramLink("https://example.org/bot")).toThrow("WebAppTgUrlInvalid");
    expect(() => f.webApp.openTelegramLink("https://t.me/homi_bot")).not.toThrow();
  });

  it("refuses a haptic style that does not exist", () => {
    const f = install();

    expect(() => f.webApp.HapticFeedback.impactOccurred("loud" as "light")).toThrow("WebAppHapticImpactStyleInvalid");
  });
});

describe("fakeTelegram recorded calls and answers", () => {
  it("records every call with its arguments", () => {
    const f = install();

    f.webApp.ready();
    f.webApp.expand();
    f.webApp.HapticFeedback.impactOccurred("medium");
    f.webApp.openLink("https://example.org/post/1");

    expect(f.calls.map(({ member, args }) => [member, args])).toEqual([
      ["ready", []],
      ["expand", []],
      ["HapticFeedback.impactOccurred", ["medium"]],
      ["openLink", ["https://example.org/post/1"]],
    ]);
    expect(f.webApp.isExpanded).toBe(true);
  });

  it("records a refused call too", () => {
    const f = install({ version: "6.0" });

    expect(() => f.webApp.showConfirm("?")).toThrow();
    expect(f.calls.map(({ member }) => member)).toEqual(["showConfirm"]);
  });

  it("answers dialogs and permissions asynchronously from its answers", async () => {
    const f = install({ answers: { confirm: false } });
    const confirmed = vi.fn();
    const writeAccess = vi.fn();

    f.webApp.showConfirm("Удалить радар?", confirmed);
    f.webApp.requestWriteAccess(writeAccess);
    expect(confirmed).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(writeAccess).toHaveBeenCalledWith(true));
    expect(confirmed).toHaveBeenCalledWith(false);
  });

  it("runs the BackButton handler when the test presses it, and not after offClick", () => {
    const f = install();
    const onBack = vi.fn();

    f.webApp.BackButton.onClick(onBack).show();
    f.emit("backButtonClicked");
    f.webApp.BackButton.offClick(onBack);
    f.emit("backButtonClicked");

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(f.webApp.BackButton.isVisible).toBe(true);
  });

  it("keeps DeviceStorage in memory, empty for every install", async () => {
    const f = install({ version: "9.0" });
    const read = vi.fn();

    f.webApp.DeviceStorage.setItem("kv-home", "1");
    f.webApp.DeviceStorage.getItem("kv-home", read);
    await vi.waitFor(() => expect(read).toHaveBeenCalledWith(null, "1"));

    f.uninstall();
    const again = install({ version: "9.0" });
    const readAgain = vi.fn();
    again.webApp.DeviceStorage.getItem("kv-home", readAgain);
    await vi.waitFor(() => expect(readAgain).toHaveBeenCalledWith(null, null));
  });

  it("reports the configured location, or null when access is denied", async () => {
    const granted = install({ answers: { location: { latitude: 41.31, longitude: 69.28, horizontal_accuracy: 25 } } });
    const onLocation = vi.fn();

    granted.webApp.LocationManager.init(() => granted.webApp.LocationManager.getLocation(onLocation));
    await vi.waitFor(() => expect(onLocation).toHaveBeenCalledWith(expect.objectContaining({ latitude: 41.31 })));
    expect(granted.webApp.LocationManager.isAccessGranted).toBe(true);

    granted.uninstall();
    const denied = install();
    const onDenied = vi.fn();
    denied.webApp.LocationManager.init(() => denied.webApp.LocationManager.getLocation(onDenied));
    await vi.waitFor(() => expect(onDenied).toHaveBeenCalledWith(null));
    expect(denied.webApp.LocationManager.isAccessGranted).toBe(false);
  });

  it("refuses getLocation before init, like the real LocationManager", () => {
    const f = install();

    expect(() => f.webApp.LocationManager.getLocation(() => undefined)).toThrow("WebAppLocationManagerNotInited");
  });
});
