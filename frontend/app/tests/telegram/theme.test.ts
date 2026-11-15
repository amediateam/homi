import { fakeTelegram, type FakeTelegram, type FakeTelegramOptions } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { storageGet } from "@/lib/storage";
import { applyTheme, getThemePreference, setThemePreference, watchTheme } from "@/lib/telegram/theme";

let fake: FakeTelegram | null = null;
const html = document.documentElement;

function launch(options: FakeTelegramOptions): FakeTelegram {
  fake?.uninstall();
  fake = fakeTelegram(options);
  return fake;
}

function colourCalls(telegram: FakeTelegram): string[] {
  return telegram.calls
    .filter((call) => call.member === "setHeaderColor" || call.member === "setBackgroundColor")
    .map((call) => `${call.member}(${String(call.args[0])})`);
}

/** What `themes.css` gives `--bg` for each state; jsdom does not load the stylesheet. */
function paintBg(value: string): void {
  html.style.setProperty("--bg", value);
}

beforeEach(() => {
  window.localStorage.clear();
  html.removeAttribute("data-theme");
  html.setAttribute("data-scheme", "light");
  html.removeAttribute("style");
});

afterEach(() => {
  fake?.uninstall();
  fake = null;
  window.localStorage.clear();
});

describe("theme states (TMA-019 … TMA-021)", () => {
  it("auto + Telegram light: scheme light, no data-theme, bg_color from 6.1", () => {
    const telegram = launch({ version: "6.9", colorScheme: "light" });
    paintBg("#ffffff");

    applyTheme();

    expect(html.dataset.scheme).toBe("light");
    expect(html.hasAttribute("data-theme")).toBe(false);
    expect(colourCalls(telegram)).toEqual(["setHeaderColor(bg_color)", "setBackgroundColor(bg_color)"]);
  });

  it("auto + Telegram dark: scheme dark, exact --bg from 6.9, else bg_color", () => {
    paintBg("#000000");
    const current = launch({ version: "6.9", colorScheme: "dark" });
    applyTheme();
    expect(html.dataset.scheme).toBe("dark");
    expect(html.hasAttribute("data-theme")).toBe(false);
    expect(colourCalls(current)).toEqual(["setHeaderColor(#000000)", "setBackgroundColor(#000000)"]);

    const older = launch({ version: "6.1", colorScheme: "dark" });
    applyTheme();
    expect(colourCalls(older)).toEqual(["setHeaderColor(bg_color)", "setBackgroundColor(bg_color)"]);
  });

  it("an explicit choice sets both attributes and the exact --bg from 6.9", () => {
    paintBg("#ffffff");
    window.localStorage.setItem("homi-theme", "light");
    const telegram = launch({ version: "6.9", colorScheme: "dark" });

    applyTheme();

    expect(html.dataset.scheme).toBe("light");
    expect(html.dataset.theme).toBe("light");
    expect(colourCalls(telegram)).toEqual(["setHeaderColor(#ffffff)", "setBackgroundColor(#ffffff)"]);
  });

  it("6.0 gets no colour calls", () => {
    const telegram = launch({ version: "6.0", colorScheme: "dark" });
    applyTheme();
    expect(html.dataset.scheme).toBe("dark");
    expect(colourCalls(telegram)).toEqual([]);
  });

  it("a non-hex computed --bg falls back to bg_color", () => {
    paintBg("rgb(0, 0, 0)");
    const telegram = launch({ version: "8.0", colorScheme: "dark" });

    applyTheme();

    expect(colourCalls(telegram)).toEqual(["setHeaderColor(bg_color)", "setBackgroundColor(bg_color)"]);
  });

  it("outside Telegram follows the preference, auto is light, and no colour is set", () => {
    applyTheme();
    expect(html.dataset.scheme).toBe("light");
    expect(html.hasAttribute("data-theme")).toBe(false);

    window.localStorage.setItem("homi-theme", "dark");
    applyTheme();
    expect(html.dataset.scheme).toBe("dark");
    expect(html.dataset.theme).toBe("dark");
  });

  it("an unknown stored value is auto", () => {
    window.localStorage.setItem("homi-theme", "sepia");
    expect(getThemePreference()).toBe("auto");
  });
});

describe("setThemePreference and themeChanged", () => {
  it("stores the preference and applies it", () => {
    setThemePreference("dark");
    expect(storageGet("homi-theme")).toBe("dark");
    expect(html.dataset.theme).toBe("dark");

    setThemePreference("auto");
    expect(storageGet("homi-theme")).toBe("auto");
    expect(html.hasAttribute("data-theme")).toBe(false);
  });

  it("themeChanged re-applies in auto and changes nothing with an explicit choice", () => {
    const telegram = launch({ version: "8.0", colorScheme: "light" });
    watchTheme();
    watchTheme();
    expect(html.dataset.scheme).toBe("light");

    const initial = colourCalls(telegram).length;
    telegram.setColorScheme("dark");
    expect(html.dataset.scheme).toBe("dark");
    const before = colourCalls(telegram).length;
    expect(before - initial, "one listener: one header and one background call").toBe(2);

    setThemePreference("light");
    const afterChoice = colourCalls(telegram).length;
    telegram.emit("themeChanged");
    expect(html.dataset.scheme).toBe("light");
    expect(colourCalls(telegram).length).toBe(afterChoice);
    expect(afterChoice).toBeGreaterThan(before);
  });
});
