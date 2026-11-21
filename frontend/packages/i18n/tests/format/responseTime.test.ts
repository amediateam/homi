import { describe, expect, it } from "vitest";

import { formatResponseTime } from "../../src/format";

describe("formatResponseTime (WP-83, fix of LB-APP-076)", () => {
  it("gives minutes below an hour, hours below a day, else days, in the locale's short units", () => {
    expect([15, 180, 2880].map((minutes) => formatResponseTime(minutes, "ru"))).toEqual(["15 мин", "3 ч", "2 дн."]);
    expect(formatResponseTime(600, "ru")).toBe("10 ч");
    expect(formatResponseTime(90, "en")).toBe("2 hr");
  });

  it("gives nothing for 0, a negative time or NaN", () => {
    expect(formatResponseTime(0, "ru")).toBeNull();
    expect(formatResponseTime(-5, "ru")).toBeNull();
    expect(formatResponseTime(Number.NaN, "ru")).toBeNull();
  });
});
