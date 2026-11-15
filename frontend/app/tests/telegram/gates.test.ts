import { describe, expect, it } from "vitest";

import { GATES, parseVersion, supportsFeature, versionAtLeast, type TelegramFeature } from "@/lib/telegram/gates";

/** The rows of TMA-042: which features each client version opens. */
const opened: Record<string, TelegramFeature[]> = {
  "6.0": [],
  "6.1": ["headerColor"],
  "6.2": ["headerColor", "confirm"],
  "6.9": ["headerColor", "confirm", "exactColors", "writeAccess"],
  "7.0": ["headerColor", "confirm", "exactColors", "writeAccess", "settingsButton"],
  "7.7": ["headerColor", "confirm", "exactColors", "writeAccess", "settingsButton", "verticalSwipes"],
  "8.0": [
    "headerColor",
    "confirm",
    "exactColors",
    "writeAccess",
    "settingsButton",
    "verticalSwipes",
    "fullscreen",
    "shareMessage",
    "homeScreen",
    "locationManager",
  ],
  "9.0": Object.keys(GATES) as TelegramFeature[],
};

describe("version gates (TMA-042)", () => {
  for (const [version, features] of Object.entries(opened)) {
    it(`${version} opens exactly its rows`, () => {
      const open = (Object.keys(GATES) as TelegramFeature[]).filter((feature) => supportsFeature(version, feature));
      expect(open.sort()).toEqual([...features].sort());
    });
  }

  it("compares the parts as numbers, so 7.10 is above 7.7", () => {
    expect(versionAtLeast("7.10", "7.7")).toBe(true);
    expect(versionAtLeast("7.7", "7.10")).toBe(false);
    expect(versionAtLeast("8", "8.0")).toBe(true);
    expect(versionAtLeast("9.1", "9.0")).toBe(true);
  });

  it("an unparsable version opens only the rows without a gate", () => {
    for (const version of ["", "abc", "8.x", "8.0 beta", undefined, null, 8]) {
      expect(parseVersion(version), String(version)).toBeNull();
      expect((Object.keys(GATES) as TelegramFeature[]).some((feature) => supportsFeature(version, feature))).toBe(false);
      expect(versionAtLeast(version, "6.0")).toBe(false);
    }
  });
});
