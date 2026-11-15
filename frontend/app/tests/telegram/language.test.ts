import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { detectLocale } from "@/lib/telegram/language";

let fake: FakeTelegram | null = null;

afterEach(() => {
  fake?.uninstall();
  fake = null;
  window.history.replaceState(null, "", "/");
});

describe("detectLocale (BR-APP-050, LB-APP-032)", () => {
  const cases: [string, string, string][] = [
    // code, flag off, flag on
    ["uz-UZ", "uz", "uz"],
    ["uz-Cyrl", "uz", "uz"],
    ["en", "ru", "en"],
    ["en-GB", "ru", "en"],
    ["kk", "ru", "ru"],
    ["", "ru", "ru"],
  ];
  for (const [code, off, on] of cases) {
    it(`"${code}" → ${off} with the flag off, ${on} with it on`, () => {
      expect(detectLocale(code)).toBe(off);
      expect(detectLocale(code, { oneDetector: false })).toBe(off);
      expect(detectLocale(code, { oneDetector: true })).toBe(on);
    });
  }
});

describe("languageCode (TMA-008)", () => {
  it("comes from the SDK user, else from the fragment's user JSON", async () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "uz" }) });
    const sdk = await import("@/lib/telegram/language");
    expect(sdk.languageCode()).toBe("uz");
    fake.uninstall();
    fake = null;

    window.history.replaceState(null, "", `/ru#tgWebAppData=${encodeURIComponent(syntheticInitData({ language_code: "en-GB" }))}`);
    vi.resetModules();
    const fresh = await import("@/lib/telegram/language");
    expect(fresh.languageCode()).toBe("en-GB");
  });

  it("is empty without launch data", async () => {
    vi.resetModules();
    const fresh = await import("@/lib/telegram/language");
    expect(fresh.languageCode()).toBe("");
  });
});
