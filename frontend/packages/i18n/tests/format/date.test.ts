import { describe, expect, it } from "vitest";

import { dateTimeZone, formatAgo, formatShortDate, formatTime, tashkentDayKey } from "../../src/format/index";
import { translator, withTimeZone } from "./translate";

/** 19:30 UTC is 00:30 of the next day in Tashkent (UTC+5). */
const LATE = "2026-11-08T19:30:00Z";

describe("formatShortDate", () => {
  it("reads «5 мар» in ru with the dot removed, «5 Mar» in en and «5-mar» in uz", () => {
    const iso = "2026-03-05T10:00:00Z";

    expect(formatShortDate(iso, "ru", { timeZone: "UTC" })).toBe("5 мар");
    expect(formatShortDate(iso, "en", { timeZone: "UTC" })).toBe("5 Mar");
    expect(formatShortDate(iso, "uz", { timeZone: "UTC" })).toBe("5-mar");
    expect(formatShortDate(new Date(iso), "ru", { timeZone: "UTC" })).toBe("5 мар");
  });

  it("uses the Uzbek short months yan … dek", () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      formatShortDate(`2026-${String(index + 1).padStart(2, "0")}-15T12:00:00Z`, "uz", { timeZone: "UTC" }),
    );

    expect(months).toEqual([
      "15-yan",
      "15-fev",
      "15-mar",
      "15-apr",
      "15-may",
      "15-iyn",
      "15-iyl",
      "15-avg",
      "15-sen",
      "15-okt",
      "15-noy",
      "15-dek",
    ]);
  });

  it("reads the day in the given time zone", () => {
    expect(formatShortDate(LATE, "ru", { timeZone: "UTC" })).toBe("8 нояб");
    expect(formatShortDate(LATE, "ru", { timeZone: "Asia/Tashkent" })).toBe("9 нояб");
    expect(formatShortDate(LATE, "uz", { timeZone: "UTC" })).toBe("8-noy");
    expect(formatShortDate(LATE, "uz", { timeZone: "Asia/Tashkent" })).toBe("9-noy");
    expect(formatShortDate(LATE, "en", { timeZone: "Asia/Tashkent" })).toBe("9 Nov");
  });

  it("gives null for an invalid date", () => {
    for (const value of ["garbage", "", "2026-13-45T00:00:00Z", new Date(Number.NaN)]) {
      expect(formatShortDate(value, "ru", { timeZone: "UTC" })).toBeNull();
    }
  });
});

describe("formatTime", () => {
  it("is the hour and minute in the number locale and the given time zone", () => {
    expect(formatTime(LATE, "ru", { timeZone: "UTC" })).toBe("19:30");
    expect(formatTime(LATE, "uz", { timeZone: "UTC" })).toBe("19:30");
    expect(formatTime(LATE, "en", { timeZone: "UTC" })).toBe("19:30");
    expect(formatTime(LATE, "ru", { timeZone: "Asia/Tashkent" })).toBe("00:30");
    expect(formatTime("2026-11-08T04:05:00Z", "en", { timeZone: "UTC" })).toBe("04:05");
  });

  it("gives null for an invalid date", () => {
    expect(formatTime("garbage", "ru", { timeZone: "UTC" })).toBeNull();
  });
});

describe("LB-APP-025: the date zone of dev014TashkentDates", () => {
  it("is the device zone (undefined) when the flag is off and Asia/Tashkent when it is on", () => {
    expect(dateTimeZone(false)).toBeUndefined();
    expect(dateTimeZone(true)).toBe("Asia/Tashkent");
  });

  it("off: the day and time follow the device zone, as legacy", () => {
    const off = { timeZone: dateTimeZone(false) };

    expect(withTimeZone("UTC", () => formatShortDate(LATE, "ru", off))).toBe("8 нояб");
    expect(withTimeZone("Asia/Tashkent", () => formatShortDate(LATE, "ru", off))).toBe("9 нояб");
    expect(withTimeZone("UTC", () => formatShortDate(LATE, "uz", off))).toBe("8-noy");
    expect(withTimeZone("Asia/Tashkent", () => formatShortDate(LATE, "uz", off))).toBe("9-noy");
    expect(withTimeZone("UTC", () => formatTime(LATE, "ru", off))).toBe("19:30");
    expect(withTimeZone("Asia/Tashkent", () => formatTime(LATE, "ru", off))).toBe("00:30");
  });

  it("on: the day and time are Tashkent's whatever the device zone", () => {
    const on = { timeZone: dateTimeZone(true) };

    for (const zone of ["UTC", "Asia/Tashkent", "America/New_York"]) {
      expect(withTimeZone(zone, () => formatShortDate(LATE, "ru", on)), zone).toBe("9 нояб");
      expect(withTimeZone(zone, () => formatShortDate(LATE, "uz", on)), zone).toBe("9-noy");
      expect(withTimeZone(zone, () => formatTime(LATE, "ru", on)), zone).toBe("00:30");
    }
  });

  it("off: matches the zone of the process the suite runs in (run once more with TZ=Asia/Tashkent)", () => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(formatShortDate(LATE, "ru", { timeZone: dateTimeZone(false) })).toBe(
      formatShortDate(LATE, "ru", { timeZone: device }),
    );
    expect(formatTime(LATE, "en", { timeZone: dateTimeZone(false) })).toBe(
      formatTime(LATE, "en", { timeZone: device }),
    );
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const before = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it("steps from «только что» through minutes and hours to days", () => {
    const t = translator("ru");

    expect(formatAgo(before(1), now, t)).toBe("только что");
    expect(formatAgo(before(2), now, t)).toBe("2 минуты назад");
    expect(formatAgo(before(5), now, t)).toBe("5 минут назад");
    expect(formatAgo(before(59), now, t)).toBe("59 минут назад");
    expect(formatAgo(before(60), now, t)).toBe("1 час назад");
    expect(formatAgo(before(30 * 60), now, t)).toBe("30 часов назад");
    expect(formatAgo(before(47 * 60), now, t)).toBe("47 часов назад");
    expect(formatAgo(before(48 * 60), now, t)).toBe("2 дня назад");
    expect(formatAgo(before(3 * 24 * 60), now, t)).toBe("3 дня назад");
    expect(formatAgo(before(21 * 24 * 60), now, t)).toBe("21 день назад");
  });

  it("holds in uz and en", () => {
    expect(formatAgo(before(1), now, translator("uz"))).toBe("hozirgina");
    expect(formatAgo(before(5), now, translator("uz"))).toBe("5 daqiqa oldin");
    expect(formatAgo(before(30 * 60), now, translator("uz"))).toBe("30 soat oldin");
    expect(formatAgo(before(3 * 24 * 60), now, translator("uz"))).toBe("3 kun oldin");
    expect(formatAgo(before(1), now, translator("en"))).toBe("just now");
    expect(formatAgo(before(5), now, translator("en"))).toBe("5 minutes ago");
    expect(formatAgo(before(60), now, translator("en"))).toBe("1 hour ago");
    expect(formatAgo(before(30 * 60), now, translator("en"))).toBe("30 hours ago");
    expect(formatAgo(before(3 * 24 * 60), now, translator("en"))).toBe("3 days ago");
  });

  it("reads a future time as «только что»", () => {
    expect(formatAgo(before(-10), now, translator("ru"))).toBe("только что");
    expect(formatAgo(before(-3 * 24 * 60), now, translator("en"))).toBe("just now");
  });

  it("takes the clock as a Date or a number", () => {
    expect(formatAgo(before(5), new Date(now), translator("ru"))).toBe("5 минут назад");
  });

  it("gives null for a missing or invalid date", () => {
    for (const value of [null, undefined, "", "garbage"]) {
      expect(formatAgo(value, now, translator("ru"))).toBeNull();
    }
    expect(formatAgo(before(5), Number.NaN, translator("ru"))).toBeNull();
  });
});

describe("tashkentDayKey", () => {
  it("is the Tashkent calendar day as YYYY-MM-DD", () => {
    expect(tashkentDayKey("2026-11-08T19:30:00Z")).toBe("2026-11-09");
    expect(tashkentDayKey("2026-11-08T18:59:59Z")).toBe("2026-11-08");
    expect(tashkentDayKey(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
    expect(tashkentDayKey(Date.parse("2026-03-05T10:00:00Z"))).toBe("2026-03-05");
  });

  it("does not depend on the device zone", () => {
    for (const zone of ["UTC", "Asia/Tashkent", "America/New_York", "Pacific/Kiritimati"]) {
      expect(withTimeZone(zone, () => tashkentDayKey(LATE)), zone).toBe("2026-11-09");
    }
  });

  it("gives null for an invalid date", () => {
    expect(tashkentDayKey("garbage")).toBeNull();
    expect(tashkentDayKey(new Date(Number.NaN))).toBeNull();
  });
});
