import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { shareText } from "@/lib/telegram/share";

let fake: FakeTelegram | null = null;

afterEach(() => {
  fake?.uninstall();
  fake = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MESSAGE = "Я съезжаю: https://t.me/homi_bot?start=owner_new";

describe("shareText (WP-82, TMA-048)", () => {
  it("inside Telegram opens t.me/share/url with the whole message in url, as legacy (LB-APP-090 not adopted)", async () => {
    fake = fakeTelegram();
    await shareText(MESSAGE);
    expect(fake.calls.find((entry) => entry.member === "openTelegramLink")?.args[0]).toBe(`https://t.me/share/url?url=${encodeURIComponent(MESSAGE)}`);
  });

  it("outside Telegram navigator.share with the text, its refusal swallowed; else a new tab", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    vi.stubGlobal("navigator", { ...navigator, share });
    await expect(shareText(MESSAGE)).resolves.toBeUndefined();
    expect(share).toHaveBeenCalledWith({ text: MESSAGE });

    vi.unstubAllGlobals();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await shareText(MESSAGE);
    expect(open).toHaveBeenCalledWith(`https://t.me/share/url?url=${encodeURIComponent(MESSAGE)}`, "_blank", "noopener");
  });
});
