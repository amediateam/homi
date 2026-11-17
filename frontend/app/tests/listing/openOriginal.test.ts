import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openOriginal } from "@/features/listing/openOriginal";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

/** `openLink` keeps the last address for its debounce across tests, so every test opens addresses of its own. */
let fake: FakeTelegram;

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/ru/listing/100001");
  fake = fakeTelegram();
});

afterEach(() => {
  vi.useRealTimers();
  fake.uninstall();
  clearTracked();
});

describe("openOriginal", () => {
  it("opens the post and logs original_opened with the number and the source only", () => {
    expect(openOriginal(100001, "https://t.me/stub_channel_a/4001", "sources")).toBe(true);

    expect(fake.calls.map((call) => [call.member, call.args[0]])).toEqual([
      ["openTelegramLink", "https://t.me/stub_channel_a/4001"],
    ]);
    expect(recentTracked()).toEqual([{ name: "original_opened", props: { listing_id: 100001, src: "sources" } }]);
  });

  it("does nothing without an address", () => {
    expect(openOriginal(100001, null, "button")).toBe(false);

    expect(fake.calls).toEqual([]);
    expect(recentTracked()).toEqual([]);
  });

  it("logs nothing when the link is refused or repeated within the debounce", () => {
    expect(openOriginal(100001, "https://evil.example/post", "offers")).toBe(false);
    expect(openOriginal(100001, "https://t.me/stub_channel_a/3979", "price_history")).toBe(true);
    expect(openOriginal(100001, "https://t.me/stub_channel_a/3979", "price_history")).toBe(false);

    expect(recentTracked()).toEqual([{ name: "original_opened", props: { listing_id: 100001, src: "price_history" } }]);
  });

  it("plays no haptic: the caller owns its tap's", () => {
    expect(openOriginal(100021, "https://t.me/stub_channel_c/5021", "video")).toBe(true);
    expect(openOriginal(100021, null, "video")).toBe(false);

    expect(fake.calls.map((call) => call.member)).toEqual(["openTelegramLink"]);
  });
});
