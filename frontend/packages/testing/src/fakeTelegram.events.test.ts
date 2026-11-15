import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeTelegram, type FakeTelegram, type FakeTelegramWindow } from "./fakeTelegram";

/** Members added for WP-21: theme and viewport changes, safe areas, the share window and the SDK's WebView. */
let fake: FakeTelegram | null = null;
const root = document.documentElement;

afterEach(() => {
  fake?.uninstall();
  fake = null;
  root.removeAttribute("style");
});

describe("fakeTelegram — theme", () => {
  it("setColorScheme changes colorScheme and themeParams, then fires themeChanged", () => {
    fake = fakeTelegram({ colorScheme: "light" });
    const seen: string[] = [];
    fake.webApp.onEvent("themeChanged", () => seen.push(fake?.webApp.colorScheme ?? ""));

    fake.setColorScheme("dark");

    expect(fake.webApp.colorScheme).toBe("dark");
    expect(fake.webApp.themeParams.bg_color).toBe("#212121");
    expect(seen).toEqual(["dark"]);
  });
});

describe("fakeTelegram — viewport and safe area", () => {
  it("writes the CSS variables the real client sets and fires the change events", () => {
    fake = fakeTelegram({ version: "8.0", safeArea: { top: 47, bottom: 34 }, contentSafeArea: { top: 46 } });
    expect(root.style.getPropertyValue("--tg-safe-area-inset-top")).toBe("47px");
    expect(root.style.getPropertyValue("--tg-safe-area-inset-bottom")).toBe("34px");
    expect(root.style.getPropertyValue("--tg-content-safe-area-inset-top")).toBe("46px");
    expect(fake.webApp.safeAreaInset).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });

    const events: string[] = [];
    fake.webApp.onEvent("safeAreaChanged", () => events.push("safeAreaChanged"));
    fake.webApp.onEvent("viewportChanged", () => events.push("viewportChanged"));
    fake.setSafeArea({ top: 20 });
    fake.setViewport({ height: 600 });

    expect(fake.webApp.safeAreaInset.top).toBe(20);
    expect(fake.webApp.viewportHeight).toBe(600);
    expect(root.style.getPropertyValue("--tg-viewport-height")).toBe("600px");
    expect(events).toEqual(["safeAreaChanged", "viewportChanged"]);
  });

  it("has no safe area below 8.0", () => {
    fake = fakeTelegram({ version: "7.10", safeArea: { top: 47 } });
    expect(root.style.getPropertyValue("--tg-safe-area-inset-top")).toBe("");
    expect(() => fake?.setSafeArea({ top: 1 })).toThrow("WebAppMethodUnsupported");
  });
});

describe("fakeTelegram — share window", () => {
  it("a share that never answers keeps the window open, like the real client", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { shareSent: "stuck" } });
    const first = vi.fn();
    fake.webApp.shareMessage("prepared-1", first);
    await Promise.resolve();

    expect(() => fake?.webApp.shareMessage("prepared-2")).toThrow("WebAppShareMessageOpened");
  });

  it("the SDK's prepared_message_failed event closes it and answers the pending callback with false", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { shareSent: "stuck" } });
    const first = vi.fn();
    fake.webApp.shareMessage("prepared-1", first);

    (window as unknown as FakeTelegramWindow).Telegram?.WebView?.receiveEvent("prepared_message_failed", { error: "UNKNOWN_ERROR" });

    expect(first).toHaveBeenCalledWith(false);
    fake.answers.shareSent = true;
    const second = vi.fn();
    fake.webApp.shareMessage("prepared-2", second);
    await Promise.resolve();
    expect(second).toHaveBeenCalledWith(true);
  });
});
