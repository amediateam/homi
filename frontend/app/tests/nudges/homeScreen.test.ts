import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HOME_DAYS_KEPT, homeDayKey, homeOfferDue, readHomeMemory, recordVisitDay, setHomeOffered } from "@/features/nudges/homeScreen";

const at = (iso: string) => Date.parse(iso);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("homeScreen (WP-31, BR-APP-045): the visit days", () => {
  it("the day key is the Tashkent date: 18:59 UTC is still the day, 19:00 UTC is the next (the fix of LB-APP-010)", () => {
    expect(homeDayKey(at("2026-11-20T18:59:59Z"))).toBe("2026-11-20");
    expect(homeDayKey(at("2026-11-20T19:00:00Z"))).toBe("2026-11-21");
    // A launch at 02:00 Tashkent time counts for that Tashkent day.
    expect(homeDayKey(at("2026-11-20T21:00:00Z"))).toBe("2026-11-21");
  });

  it("the same day twice adds nothing; a new day is added", () => {
    recordVisitDay(at("2026-11-20T08:00:00Z"));
    recordVisitDay(at("2026-11-20T15:00:00Z"));
    expect(readHomeMemory().days).toEqual(["2026-11-20"]);

    recordVisitDay(at("2026-11-21T08:00:00Z"));
    expect(readHomeMemory()).toEqual({ days: ["2026-11-20", "2026-11-21"], offered: false });
  });

  it(`eleven days keep the last ${HOME_DAYS_KEPT}`, () => {
    for (let day = 1; day <= 11; day += 1) {
      recordVisitDay(at(`2026-11-${String(day).padStart(2, "0")}T08:00:00Z`));
    }
    const { days } = readHomeMemory();
    expect(days).toHaveLength(10);
    expect(days[0]).toBe("2026-11-02");
    expect(days.at(-1)).toBe("2026-11-11");
  });

  it("a broken value reads as nothing recorded, and the next visit writes it again", () => {
    for (const raw of ["{", '"x"', '{"days": "2026-11-20", "offered": "yes"}', '{"days": [1, "nope", "2026-11-20"]}']) {
      window.localStorage.setItem("homi-home", raw);
      const memory = readHomeMemory();
      expect(memory.offered, raw).toBe(false);
      expect(memory.days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)), raw).toBe(true);
    }
    window.localStorage.setItem("homi-home", "{");
    recordVisitDay(at("2026-11-20T08:00:00Z"));
    expect(readHomeMemory()).toEqual({ days: ["2026-11-20"], offered: false });
  });

  it("the offer is due from three visit days while not offered; offered and false again are kept with the days", () => {
    recordVisitDay(at("2026-11-18T08:00:00Z"));
    recordVisitDay(at("2026-11-19T08:00:00Z"));
    expect(homeOfferDue()).toBe(false);
    recordVisitDay(at("2026-11-20T08:00:00Z"));
    expect(homeOfferDue()).toBe(true);

    setHomeOffered(true);
    expect(homeOfferDue()).toBe(false);
    expect(readHomeMemory().days).toHaveLength(3);
    setHomeOffered(false);
    expect(homeOfferDue()).toBe(true);
  });
});
