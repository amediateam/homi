import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { shareMessage, shareUrl } from "@/lib/telegram/share";

let fake: FakeTelegram | null = null;

afterEach(() => {
  fake?.uninstall();
  fake = null;
});

/** The SDK's own event entry point, which the stale-window recovery uses (TMA-030). */
function addWebView(): ReturnType<typeof vi.fn> {
  const receiveEvent = vi.fn();
  (window as unknown as { Telegram: Record<string, unknown> }).Telegram.WebView = { receiveEvent };
  return receiveEvent;
}

describe("shareMessage (TMA-030)", () => {
  it("resolves with the client's answer from 8.0", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { shareSent: true } });
    await expect(shareMessage("prepared-1")).resolves.toBe(true);

    fake.answers.shareSent = false;
    await expect(shareMessage("prepared-2")).resolves.toBe(false);
  });

  it("recovers a stale share window once: prepared_message_failed, then one retry", async () => {
    fake = fakeTelegram({ version: "8.0" });
    const receiveEvent = addWebView();
    const original = fake.webApp.shareMessage.bind(fake.webApp);
    let attempts = 0;
    fake.webApp.shareMessage = (id, callback) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("WebAppShareMessageOpened");
      }
      original(id, callback);
    };

    await expect(shareMessage("prepared-1")).resolves.toBe(true);
    expect(attempts).toBe(2);
    expect(receiveEvent).toHaveBeenCalledWith("prepared_message_failed", { error: "UNKNOWN_ERROR" });
  });

  it("gives up after the one retry", async () => {
    fake = fakeTelegram({ version: "8.0" });
    addWebView();
    let attempts = 0;
    fake.webApp.shareMessage = () => {
      attempts += 1;
      throw new Error("WebAppShareMessageOpened");
    };
    await expect(shareMessage("prepared-1")).resolves.toBe(false);
    expect(attempts).toBe(2);
  });

  it("rethrows other errors", async () => {
    fake = fakeTelegram({ version: "8.0" });
    fake.webApp.shareMessage = () => {
      throw new Error("WebAppShareMessageInvalid");
    };
    await expect(shareMessage("prepared-1")).rejects.toThrow("WebAppShareMessageInvalid");
  });

  it("is false below 8.0 and outside Telegram", async () => {
    await expect(shareMessage("prepared-1")).resolves.toBe(false);
    fake = fakeTelegram({ version: "7.10" });
    await expect(shareMessage("prepared-1")).resolves.toBe(false);
    expect(fake.calls.map((entry) => entry.member)).not.toContain("shareMessage");
  });
});

describe("shareUrl (TMA-031)", () => {
  it("inside Telegram opens t.me/share/url", async () => {
    fake = fakeTelegram();
    await shareUrl("https://homi.uz/l/42", "Квартира");
    expect(fake.calls.find((entry) => entry.member === "openTelegramLink")?.args[0]).toBe(
      "https://t.me/share/url?url=https%3A%2F%2Fhomi.uz%2Fl%2F42&text=%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0",
    );
  });

  it("outside Telegram uses navigator.share, else a new tab", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    await shareUrl("https://homi.uz/l/42", "x");
    expect(share).toHaveBeenCalledWith({ url: "https://homi.uz/l/42", text: "x" });

    vi.unstubAllGlobals();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await shareUrl("https://homi.uz/l/42", "x");
    expect(open).toHaveBeenCalledWith("https://t.me/share/url?url=https%3A%2F%2Fhomi.uz%2Fl%2F42&text=x", "_blank", "noopener");
  });
});
