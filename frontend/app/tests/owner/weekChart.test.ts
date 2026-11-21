import { describe, expect, it } from "vitest";

import { normalizeOwnerListing } from "@/features/owner/normalize";
import { fillHints } from "@/features/owner/panel/fillHints";
import { barHeights, weekLabels } from "@/features/owner/panel/weekChart";

describe("weekLabels (Asia/Tashkent, fix of LB-APP-062)", () => {
  it("names the seven days back from today in Tashkent, capitalised, today last", () => {
    // Saturday 21 Nov 2026, 12:00 in Tashkent.
    const now = Date.parse("2026-11-21T07:00:00Z");
    expect(weekLabels(now, "ru")).toEqual(["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]);
    expect(weekLabels(now, "en")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("counts the day in Tashkent, not on the device: 20:00 UTC on Friday is Saturday there", () => {
    expect(weekLabels(Date.parse("2026-11-20T20:00:00Z"), "ru").at(-1)).toBe("Сб");
    expect(weekLabels(Date.parse("2026-11-20T18:59:00Z"), "ru").at(-1)).toBe("Пт");
  });

  it("never uses legacy's initials", () => {
    expect(weekLabels(Date.parse("2026-11-21T07:00:00Z"), "ru").join(",")).not.toBe("П,В,С,Ч,П,С,В");
  });
});

describe("barHeights", () => {
  it("is per cent of the highest day, all 0 when nobody opened it", () => {
    expect(barHeights([0, 0, 0, 0, 0, 12, 24])).toEqual([0, 0, 0, 0, 0, 50, 100]);
    expect(barHeights([0, 0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("fillHints (BR-APP-093)", () => {
  const listing = (form: Record<string, unknown>, photos: number) =>
    normalizeOwnerListing({ id: "01JF0000000000000000000003", status: "active", form, photos: Array.from({ length: photos }, (_, index) => ({ id: `p${index}`, url: `https://cdn.test/${index}.jpg` })) })!;

  it("lists the open items first, in their order, and counts the filled ones out of five", () => {
    const hints = fillHints(listing({ area_m2: 54, floor: null, renovation: "euro", description: " " }, 3));
    expect(hints.filled).toBe(2);
    expect(hints.total).toBe(5);
    expect(hints.items.map((item) => item.field)).toEqual(["photos", "floor", "description", "area_m2", "renovation"]);
    expect(hints.items[0]).toEqual({ field: "photos", key: "own.panel.addPhotos", values: { n: 3 }, done: false });
  });

  it("photos count from five on", () => {
    const hints = fillHints(listing({ area_m2: 54, floor: 4, renovation: "euro", description: "Светлая" }, 5));
    expect(hints.filled).toBe(5);
    expect(hints.items.find((item) => item.field === "photos")).toEqual({ field: "photos", key: "own.panel.photosDone", values: { n: 5 }, done: true });
  });
});
