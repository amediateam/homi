"use client";

import type { Locale } from "@homi/config";
import { numberLocale } from "@homi/i18n";
import { cn, TrendingDown, TrendingUp } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useMoney } from "@/lib/money/useMoney";
import { tg } from "@/lib/telegram";

import type { PriceEvent } from "../listingData";
import { openOriginal } from "../openOriginal";
import { HistoryDate } from "./HistoryDate";

/** Placeholders the one-entry sentence is cut at, so its date and channel become elements, never HTML. */
const DATE_SLOT = "\uE000";
const CHANNEL_SLOT = "\uE001";
const SLOTS = new RegExp(`(${DATE_SLOT}|${CHANNEL_SLOT})`);

/** The leading dot of a timeline row by the event's `kind` (legacy); any other kind or none is a faded dot. */
const DOT: Readonly<Record<string, string>> = {
  price_down: "bg-good",
  price_up: "bg-high",
  published: "bg-accent ring-3 ring-accent/25",
};

const CHANNEL_LINK = "font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The price history (BR-APP-069). One event: «История» and the sentence «Опубликовано {date} в @{channel}…», whose
 * `@channel` opens the post when the event has a link. Several: «История цены», a row per event — date and time,
 * the dot of its kind, `text · @channel`, the price and the change in percent (legacy: the server's percent as it
 * is, green below zero, orange from zero up, with the trend icon of its sign). A row with a link opens the post.
 * Every link plays the light haptic. Dates follow `HistoryDate`.
 */
export function HistorySection({
  number,
  history,
  tashkentDates,
  selfPlaced = null,
}: {
  number: number;
  history: readonly PriceEvent[];
  tashkentDates: boolean;
  /** A self-placed listing's single entry (WP-83, BR-APP-102): HOMI's sentence for a native one, the neutral one else. */
  selfPlaced?: "native" | "legacy" | null;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const money = useMoney();

  if (history.length === 0) {
    return null;
  }

  const open = (url: string | null) => {
    tg.haptic.impact("light");
    openOriginal(number, url, "price_history");
  };

  if (history.length === 1 && selfPlaced !== null) {
    const [event] = history;
    const pieces = t(selfPlaced === "native" ? "details.historySelfHomi" : "details.historySelf", { date: DATE_SLOT }).split(SLOTS);
    return (
      <section data-section="history" data-history="self" className="flex flex-col gap-[10px] px-(--gutter) py-[12px]">
        <h2 className="text-[17px] font-bold">{t("details.history")}</h2>
        <p className="leading-snug">
          {pieces.map((piece, index) => (piece === DATE_SLOT ? <HistoryDate key={index} at={event!.at} part="date" tashkentDates={tashkentDates} /> : piece))}
        </p>
      </section>
    );
  }

  if (history.length === 1) {
    const [event] = history;
    const pieces = t("details.historySingle", { date: DATE_SLOT, channel: CHANNEL_SLOT }).split(SLOTS);
    const sentence: ReactNode[] = pieces.map((piece, index) => {
      if (piece === DATE_SLOT) {
        return <HistoryDate key={index} at={event.at} part="date" tashkentDates={tashkentDates} />;
      }
      if (piece === CHANNEL_SLOT) {
        const handle = `@${event.channel}`;
        return event.url === null ? (
          <span key={index}>{handle}</span>
        ) : (
          <button key={index} type="button" data-history-channel="" onClick={() => open(event.url)} className={CHANNEL_LINK}>
            {handle}
          </button>
        );
      }
      // The catalogue writes «@» before the channel; the button carries it.
      return pieces[index + 1] === CHANNEL_SLOT && piece.endsWith("@") ? piece.slice(0, -1) : piece;
    });
    return (
      <section data-section="history" data-history="single" className="flex flex-col gap-[10px] px-(--gutter) py-[12px]">
        <h2 className="text-[17px] font-bold">{t("details.history")}</h2>
        <p className="leading-snug">{sentence}</p>
      </section>
    );
  }

  const percent = new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 3 });
  return (
    <section data-section="history" data-history="timeline" className="flex flex-col gap-[10px] px-(--gutter) py-[12px]">
      <h2 className="text-[17px] font-bold">{t("details.priceHistory")}</h2>
      <ol className="flex flex-col">
        {history.map((event, index) => {
          const label = [event.text, `@${event.channel}`].filter(Boolean).join(" · ");
          const down = event.change_pct !== null && event.change_pct < 0;
          const row = (
            <>
              <span className="flex w-[52px] flex-none flex-col text-[13px] leading-snug text-hint">
                <HistoryDate at={event.at} part="date" tashkentDates={tashkentDates} />
                <HistoryDate at={event.at} part="time" tashkentDates={tashkentDates} />
              </span>
              <span
                data-kind={event.kind ?? ""}
                aria-hidden
                className={cn(
                  "mt-[6px] size-[8px] flex-none rounded-pill",
                  (event.kind !== null && Object.hasOwn(DOT, event.kind) && DOT[event.kind]) || "bg-hint opacity-50",
                )}
              />
              <span className="min-w-0 flex-1 break-words">{label}</span>
              <span className="flex flex-none flex-col items-end leading-snug">
                {event.price_usd !== null ? <b className="font-bold">{money.format(event.price_usd)}</b> : null}
                {event.change_pct !== null ? (
                  <span
                    data-change={down ? "down" : "up"}
                    className={cn("inline-flex items-center gap-[3px] text-[13px] font-semibold", down ? "text-good" : "text-high")}
                  >
                    {down ? (
                      <TrendingDown size={13} strokeWidth={2.5} aria-hidden />
                    ) : (
                      <TrendingUp size={13} strokeWidth={2.5} aria-hidden />
                    )}
                    {`${event.change_pct > 0 ? "+" : ""}${percent.format(event.change_pct)}%`}
                  </span>
                ) : null}
              </span>
            </>
          );
          const rowClass = "flex w-full items-start gap-[10px] py-[8px] text-left";
          return (
            <li key={`${event.at}:${index}`} className="border-b border-sep last:border-b-0">
              {event.url === null ? (
                <div data-history-row="" className={rowClass}>
                  {row}
                </div>
              ) : (
                <button
                  type="button"
                  data-history-row=""
                  onClick={() => open(event.url)}
                  className={cn(rowClass, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                >
                  {row}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
