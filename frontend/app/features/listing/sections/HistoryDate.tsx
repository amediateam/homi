"use client";

import type { Locale } from "@homi/config";
import { dateTimeZone, formatShortDate, formatTime } from "@homi/i18n/format";
import { cn } from "@homi/ui";
import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";

const noop = () => () => undefined;

/**
 * The date or the time of a history event (LB-APP-025): «5 мар» (uz «5-mar») or «19:30». In the device zone, as
 * legacy, the value is unknown on the server, so the server and the hydration render leave a fixed-width empty cell
 * that the client fills (`preventing-flash-before-hydration.md`, its fallback: no inline script); a client-only
 * mount (a soft navigation) fills it at once. With `dev014TashkentDates` the zone is Asia/Tashkent, known everywhere,
 * so the server renders the value.
 */
export function HistoryDate({ at, part, tashkentDates }: { at: string; part: "date" | "time"; tashkentDates: boolean }) {
  const locale = useLocale() as Locale;
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const zone = { timeZone: dateTimeZone(tashkentDates) };
  const value =
    tashkentDates || hydrated ? (part === "date" ? formatShortDate(at, locale, zone) : formatTime(at, locale, zone)) : null;

  return (
    <time dateTime={at} className={cn("inline-block whitespace-nowrap", value === null && "min-w-[5ch]")}>
      {value}
    </time>
  );
}
