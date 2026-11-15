import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINK_DEBOUNCE_MS, linkHosts, openLink } from "@/lib/telegram/links";

let fake: FakeTelegram | null = null;
const opened = (telegram: FakeTelegram) =>
  telegram.calls.filter((call) => call.member === "openLink" || call.member === "openTelegramLink").map((call) => `${call.member} ${String(call.args[0])}`);

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/ru");
});

afterEach(() => {
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
});

describe("openLink (TMA-028)", () => {
  it("sends t.me to openTelegramLink and the other allowed hosts to openLink", () => {
    fake = fakeTelegram();

    expect(openLink("https://t.me/homi_bot?start=x")).toBe(true);
    expect(openLink("https://yandex.uz/maps/?ll=69.2,41.3")).toBe(true);
    expect(openLink("https://www.google.com/maps/search/?api=1")).toBe(true);

    expect(opened(fake)).toEqual([
      "openTelegramLink https://t.me/homi_bot?start=x",
      "openLink https://yandex.uz/maps/?ll=69.2,41.3",
      "openLink https://www.google.com/maps/search/?api=1",
    ]);
  });

  it("refuses http:, javascript:, garbage and hosts outside the allow-list", () => {
    fake = fakeTelegram();
    for (const url of ["http://t.me/x", "javascript:alert(1)", "not a url", "https://evil.example/x", "https://t.me.evil.example/x", "https://wwww.google.com/"]) {
      expect(openLink(url), url).toBe(false);
    }
    expect(opened(fake)).toEqual([]);
  });

  it("the same address within 1.5 s is refused, another address is not", () => {
    fake = fakeTelegram();

    expect(openLink("https://t.me/a")).toBe(true);
    expect(openLink("https://t.me/a")).toBe(false);
    expect(openLink("https://t.me/b")).toBe(true);
    vi.advanceTimersByTime(LINK_DEBOUNCE_MS);
    expect(openLink("https://t.me/a")).toBe(true);
    expect(LINK_DEBOUNCE_MS).toBe(1500);
  });

  it("allows the app's own origin and its landing", () => {
    window.history.replaceState(null, "", "/ru");
    expect(linkHosts()).toEqual(expect.arrayContaining(["t.me", "yandex.uz", "google.com", window.location.hostname]));
    expect(linkHosts("app.homi.uz")).toEqual(expect.arrayContaining(["app.homi.uz", "homi.uz"]));
  });

  it("outside Telegram opens a new tab without an opener", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    expect(openLink("https://t.me/homi_bot")).toBe(true);

    expect(open).toHaveBeenCalledWith("https://t.me/homi_bot", "_blank", "noopener");
  });
});
