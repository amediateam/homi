const DAY_MS = 86_400_000;
/** Asia/Tashkent is UTC+5 all year. */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

/**
 * The labels of «Открывали за 7 дней» (WP-82, SCR-059, fix of LB-APP-062): the short weekday names of `Intl` for the
 * seven days counted back from today in Asia/Tashkent — never the device's zone, never legacy's initials — with a
 * capital first letter («Пн», «Вт»…; `Intl` itself gives «пн»), today last.
 */
export function weekLabels(now: number, locale: string): string[] {
  const today = Math.floor((now + TASHKENT_OFFSET_MS) / DAY_MS);
  const format = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => {
    // Noon of that Tashkent date, read as UTC: the weekday of the date itself.
    const name = format.format(new Date((today - 6 + index) * DAY_MS + DAY_MS / 2)).replace(/\.$/, "");
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  });
}

/** The bars' heights in per cent of the highest day; all 0 when nobody opened it. */
export function barHeights(daily: readonly number[]): number[] {
  const top = Math.max(0, ...daily);
  return daily.map((count) => (top === 0 ? 0 : Math.round((count / top) * 100)));
}
