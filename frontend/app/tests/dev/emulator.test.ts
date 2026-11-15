import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildEmulator, cleanEmulator, writeEmulator } from "@/dev/build.mjs";

const host = window as unknown as Record<string, unknown> & {
  Telegram?: { WebApp: { version: string; platform: string; initData: string; BackButton: { show(): void }; onEvent(type: string, callback: () => void): void } };
};
const emulator = buildEmulator();

function run(): void {
  (0, eval)(emulator);
}

function removeTelegram(): void {
  Object.defineProperty(window, "Telegram", { value: undefined, configurable: true, writable: true });
  delete host.Telegram;
  delete host.__homiFakeTelegram;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  for (const node of document.querySelectorAll("[data-dev-emulator]")) {
    node.remove();
  }
  removeTelegram();
  delete host.TelegramWebviewProxy;
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("development emulator (TMA-045)", () => {
  it("asks how to start when nothing is chosen, and installs nothing", () => {
    run();
    expect(document.querySelector("[data-dev-emulator=form]")).not.toBeNull();
    expect(host.Telegram).toBeUndefined();
  });

  it("with the fake user installs the double of @homi/testing with the chosen version and platform", () => {
    window.sessionStorage.setItem("homi-dev-initData", "fake");
    window.sessionStorage.setItem("homi-dev-telegram", JSON.stringify({ version: "7.0", platform: "android", colorScheme: "dark" }));
    run();

    expect(host.Telegram?.WebApp.version).toBe("7.0");
    expect(host.Telegram?.WebApp.platform).toBe("android");
    expect(host.Telegram?.WebApp.initData).toContain("hash=" + "0".repeat(64));
    expect(document.querySelector("[data-dev-emulator=bar]")).not.toBeNull();
  });

  it("uses pasted launch data of the developer's own dev bot", () => {
    window.sessionStorage.setItem("homi-dev-initData", "query_id=AAA&user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc");
    run();
    expect(host.Telegram?.WebApp.initData).toBe("query_id=AAA&user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc");
  });

  it("keeps the double when the real SDK assigns its own object later", () => {
    window.sessionStorage.setItem("homi-dev-initData", "fake");
    run();
    const double = host.Telegram?.WebApp;

    (window as unknown as { Telegram: { WebApp: unknown } }).Telegram.WebApp = { version: "6.0" };
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { version: "6.0" } };

    expect(host.Telegram?.WebApp).toBe(double);
  });

  it("the dev bar's Back fires backButtonClicked while the BackButton is shown", () => {
    window.sessionStorage.setItem("homi-dev-initData", "fake");
    run();
    const clicked = vi.fn();
    host.Telegram?.WebApp.onEvent("backButtonClicked", clicked);
    host.Telegram?.WebApp.BackButton.show();

    (document.querySelector("[data-dev-emulator=back]") as HTMLButtonElement).click();

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("does nothing inside a real Telegram", () => {
    host.TelegramWebviewProxy = { postEvent: () => undefined };
    window.sessionStorage.setItem("homi-dev-initData", "fake");
    run();
    expect(host.Telegram).toBeUndefined();
    expect(document.querySelector("[data-dev-emulator]")).toBeNull();
  });
});

describe("emulator build", () => {
  it("writes public/__dev/telegram-emulator.js for next dev and removes it for a build", () => {
    const dir = mkdtempSync(join(tmpdir(), "homi-emulator-"));
    try {
      const file = writeEmulator(dir);
      expect(readFileSync(file, "utf8")).toContain("homi-dev-initData");
      cleanEmulator(dir);
      expect(existsSync(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the output is git-ignored", () => {
    expect(readFileSync(join(import.meta.dirname, "../../.gitignore"), "utf8")).toMatch(/^\/public\/__dev\/$/m);
  });
});
