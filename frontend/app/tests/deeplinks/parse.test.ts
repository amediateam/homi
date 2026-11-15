import { syntheticInitData } from "@homi/testing";
import { describe, expect, it } from "vitest";

import { parseLaunch } from "@/lib/deeplinks/parse";

const launch = (startParam?: string) => syntheticInitData({}, { startParam });

describe("parseLaunch (TMA-010 … TMA-012)", () => {
  it("l_<number> opens the listing; the source follows the suffix", () => {
    const cases: [string, number, string][] = [
      ["l_123", 123, "share"],
      ["l_123-web", 123, "web"],
      ["l_123-fb12", 123, "fb"],
      ["l_123-tg7", 123, "tg"],
      ["l_123-ig1234", 123, "ig"],
      ["l_123-ig12345", 123, "share"],
      ["l_123-seo", 123, "seo"],
      ["l_123-seo-example_channel-45", 123, "seo"],
    ];
    for (const [startParam, number, source] of cases) {
      expect(parseLaunch(launch(startParam), ""), startParam).toMatchObject({ listingNumber: number, source, entry: "link" });
    }
  });

  it("a post address comes from l_<n>-[seo-]<channel>-<post>", () => {
    expect(parseLaunch(launch("l_123-seo-example_channel-45"), "").postUrl).toBe("https://t.me/example_channel/45");
    expect(parseLaunch(launch("l_9-homi_rent-123456"), "").postUrl).toBe("https://t.me/homi_rent/123456");
    expect(parseLaunch(launch("l_9-abc-1"), "").postUrl).toBeNull();
    expect(parseLaunch(launch("l_9-web"), "").postUrl).toBeNull();
  });

  it("refuses numbers that are not positive safe integers", () => {
    for (const startParam of ["l_abc", "l_0", "l_12345678901234567", "l_-5", "x_12"]) {
      expect(parseLaunch(launch(startParam), "").listingNumber, startParam).toBeNull();
    }
  });

  it("?listing= opens the listing when start_param has none, and start_param wins over it", () => {
    expect(parseLaunch(launch(), "?listing=7")).toMatchObject({ listingNumber: 7, source: null, entry: "link" });
    expect(parseLaunch(launch("l_42-web"), "?listing=7")).toMatchObject({ listingNumber: 42, source: "web" });
    expect(parseLaunch(launch(), "?listing=0").listingNumber).toBeNull();
  });

  it("?news= and ?map= follow their patterns", () => {
    expect(parseLaunch(launch(), "?news=pets")).toMatchObject({ news: "pets", entry: "news" });
    expect(parseLaunch(launch(), "?news=Pets!").news).toBeNull();
    expect(parseLaunch(launch(), "?news=pets&listing=5").entry).toBe("link");
    expect(parseLaunch(launch(), "?map=leaflet").mapOverride).toBe("leaflet");
    expect(parseLaunch(launch(), "?map=svg").mapOverride).toBeNull();
    expect(parseLaunch(launch(), "")).toMatchObject({ entry: "menu", listingNumber: null, news: null, source: null });
  });

  it("never throws on garbage", () => {
    expect(() => parseLaunch("%%%", "?%%")).not.toThrow();
    expect(parseLaunch("", "").entry).toBe("menu");
  });

  it("is memoised per input", () => {
    expect(parseLaunch(launch("l_1"), "")).toBe(parseLaunch(launch("l_1"), ""));
  });
});
