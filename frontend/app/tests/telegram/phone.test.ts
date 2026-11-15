import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { call, TEL_DETECTION_MS } from "@/lib/telegram/phone";

let fake: FakeTelegram | null = null;
let dialled: string[] = [];
const PHONE = "+998901234567";
let CALL_URL = "";
let calls = 0;

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  // A fresh address per test: openLink refuses the same one within 1.5 s (TMA-028).
  CALL_URL = `https://t.me/homi_bot?start=call${++calls}`;
  dialled = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    dialled.push(this.href);
  });
});

afterEach(() => {
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
  setHidden(false);
});

const openedLinks = () => (fake?.calls ?? []).filter((entry) => entry.member === "openTelegramLink" || entry.member === "openLink").map((entry) => entry.args[0]);

describe("call (TMA-029)", () => {
  it("Android: tel: first, and leaving the app within 1.2 s counts as a call", async () => {
    fake = fakeTelegram({ platform: "android" });
    const result = call(PHONE, CALL_URL);
    expect(dialled).toEqual([`tel:${PHONE}`]);

    await vi.advanceTimersByTimeAsync(300);
    setHidden(true);

    await expect(result).resolves.toBe("tel");
    expect(openedLinks()).toEqual([]);
  });

  it("Android: a blur counts as leaving too", async () => {
    fake = fakeTelegram({ platform: "android_x" });
    const result = call(PHONE, CALL_URL);
    window.dispatchEvent(new Event("blur"));
    await expect(result).resolves.toBe("tel");
  });

  it("Android: staying for 1.2 s opens the call page", async () => {
    fake = fakeTelegram({ platform: "android" });
    const result = call(PHONE, CALL_URL);

    await vi.advanceTimersByTimeAsync(TEL_DETECTION_MS);

    await expect(result).resolves.toBe("browser");
    expect(openedLinks()).toEqual([CALL_URL]);
    expect(TEL_DETECTION_MS).toBe(1200);
  });

  it("other platforms open the call page at once", async () => {
    fake = fakeTelegram({ platform: "ios" });
    await expect(call(PHONE, CALL_URL)).resolves.toBe("browser");
    expect(dialled).toEqual([]);
  });

  it("no call page and no tel: → null", async () => {
    fake = fakeTelegram({ platform: "ios" });
    await expect(call(PHONE, null)).resolves.toBeNull();

    fake.uninstall();
    fake = fakeTelegram({ platform: "android" });
    const result = call(PHONE, null);
    await vi.advanceTimersByTimeAsync(TEL_DETECTION_MS);
    await expect(result).resolves.toBeNull();
  });

  it("a phone that is not +998 and 9 digits never tries tel:", async () => {
    fake = fakeTelegram({ platform: "android" });
    for (const phone of ["+99890123456", "998901234567", "+7 900 123 45 67", "+998 90 123 45 67", ""]) {
      await expect(call(phone, CALL_URL), phone).resolves.toBe("browser");
      vi.advanceTimersByTime(2000);
    }
    expect(dialled).toEqual([]);
  });
});
