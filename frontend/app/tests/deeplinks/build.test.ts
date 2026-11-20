import { describe, expect, it, vi } from "vitest";

import { botStartAppUrl, botStartUrl, botUrl, channelPostUrl, noAccessStartUrl, supportUrl } from "@/lib/deeplinks/build";

vi.mock("@/lib/brand", () => ({ brand: { botUsername: "homi_test_bot" } }));

describe("deep-link builders (TMA-013)", () => {
  it("build the bot links", () => {
    expect(botUrl()).toBe("https://t.me/homi_test_bot");
    expect(botStartUrl()).toBe("https://t.me/homi_test_bot?start");
    expect(botStartUrl("s_feed-x")).toBe("https://t.me/homi_test_bot?start=s_feed-x");
    expect(botStartAppUrl(42)).toBe("https://t.me/homi_test_bot?startapp=l_42");
    expect(noAccessStartUrl("access")).toBe("https://t.me/homi_test_bot?start=s_access");
    expect(noAccessStartUrl("access", 42)).toBe("https://t.me/homi_test_bot?start=s_access--l42");
  });

  it("the SEO source carries the interface language: seo_en in en, seo_uz in uz, seo in ru (WP-36, BR-API-194)", () => {
    expect(noAccessStartUrl("seo", 42, "ru")).toBe("https://t.me/homi_test_bot?start=s_seo--l42");
    expect(noAccessStartUrl("seo", 42, "uz")).toBe("https://t.me/homi_test_bot?start=s_seo_uz--l42");
    expect(noAccessStartUrl("seo", 42, "en")).toBe("https://t.me/homi_test_bot?start=s_seo_en--l42");
    expect(noAccessStartUrl("seo", 42)).toBe("https://t.me/homi_test_bot?start=s_seo--l42");
  });

  it("other sources are passed as they are in every locale", () => {
    for (const locale of ["ru", "uz", "en"] as const) {
      expect(noAccessStartUrl("share", 42, locale)).toBe("https://t.me/homi_test_bot?start=s_share--l42");
      expect(noAccessStartUrl("web", 42, locale)).toBe("https://t.me/homi_test_bot?start=s_web--l42");
      expect(noAccessStartUrl("fb12", 42, locale)).toBe("https://t.me/homi_test_bot?start=s_fb12--l42");
    }
  });

  it("build the support and channel links", () => {
    expect(supportUrl("homi_support")).toBe("https://t.me/homi_support");
    expect(supportUrl("homi_support", 42)).toBe("https://t.me/homi_support?start=l_42");
    expect(channelPostUrl("homi_rent", 15)).toBe("https://t.me/homi_rent/15");
  });

  it("answer null for a missing or invalid part", () => {
    expect(supportUrl("")).toBeNull();
    expect(supportUrl("ab")).toBeNull();
    expect(supportUrl("bad-name")).toBeNull();
    expect(channelPostUrl("homi rent", 1)).toBeNull();
    expect(channelPostUrl("homi_rent", 0)).toBeNull();
    expect(botStartAppUrl(1.5)).toBeNull();
    expect(botStartUrl("x".repeat(65))).toBeNull();
    expect(botStartUrl("a b")).toBeNull();
    expect(noAccessStartUrl("x".repeat(60), 123456)).toBeNull();
  });
});
