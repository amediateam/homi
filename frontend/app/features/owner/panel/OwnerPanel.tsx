"use client";

import { ChevronRight, ErrorState, RollNumber } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { useMinute } from "@/features/feed/minuteClock";
import { SectionSkeleton } from "@/features/listing/ListingSkeleton";
import { track } from "@/lib/analytics/events";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { OwnerStatusChip, ownerNote } from "../lists/parts";
import { normalizeOwnerListing, type OwnerListingView, type OwnerStats } from "../normalize";
import { trackAttention } from "../signals/attention";
import { manageable } from "../status";
import { useOwnerEnabled, useOwnerListing } from "../store";
import { fillHints } from "./fillHints";
import { barHeights, weekLabels } from "./weekChart";

/**
 * The panel «Ваше объявление» on the user's own listing (WP-82, SCR-059, BR-APP-103): the heading with the status chip
 * and «Этот блок видите только вы.»; «N человек ждут ответа · Ответить» while requests wait (`owner_attention` banner,
 * shown and clicked once per launch); the four stats tiles; «Открывали за 7 дней» with seven bars; «В HOMI N дней»;
 * the note of a withdrawn or held listing; and, for a manageable listing while the cabinet is on, the fill hints. It
 * reads `GET /owner/listings/{id}` through the store: a skeleton while it loads, an island with «Повторить» after it
 * failed. The footer is `OwnerPanelFooter`.
 */
export function OwnerPanel({ listingId, number }: { listingId: string; number: number }) {
  const t = useTranslations();
  const resource = useOwnerListing(listingId);
  const listing = useMemo(() => (resource.data === undefined ? null : normalizeOwnerListing(resource.data)), [resource.data]);
  const now = (useMinute(true) ?? 0) * 60_000;
  const pending = listing?.stats?.pending ?? 0;

  useEffect(() => {
    if (pending > 0) {
      trackAttention("banner", "shown");
    }
  }, [pending]);

  if (listing === null) {
    if (resource.error !== null || resource.data !== undefined) {
      return (
        <section data-owner-panel="error" className="rounded-[16px] bg-fill p-[8px]">
          <ErrorState kind="server" title={t("common.loadFailed")} text={t("error.serverText")} retryLabel={t("error.retry")} onRetry={() => void resource.refetch()} />
        </section>
      );
    }
    return (
      <section data-owner-panel="loading" className="rounded-[16px] bg-fill px-[14px]">
        <SectionSkeleton lines={4} />
      </section>
    );
  }
  const stats = listing.stats;
  const note = ownerNote(listing, (key, values) => t(key as never, values as never));

  return (
    <section data-owner-panel="" className="flex flex-col gap-[14px] rounded-[16px] bg-fill p-[14px]">
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center justify-between gap-[8px]">
          <h2 className="text-[17px] font-bold text-text">{t("own.panel.title")}</h2>
          <OwnerStatusChip listing={listing} now={now} />
        </div>
        <p className="text-[13px] text-hint">{t("own.panel.hint")}</p>
      </div>
      {pending > 0 ? (
        <button
          type="button"
          data-action="answer"
          onClick={() => {
            tg.haptic.impact("light");
            trackAttention("banner", "clicked");
            nav.push(routes.listingRequests(number));
          }}
          className="flex items-center justify-between gap-[8px] rounded-[12px] bg-bg px-[12px] py-[10px] text-left"
        >
          <span className="text-[15px] font-semibold text-danger">{t("own.panel.waiting", { n: pending })}</span>
          <span className="flex items-center gap-[2px] text-[15px] font-semibold text-accent">
            {t("own.panel.answer")}
            <ChevronRight size={16} aria-hidden />
          </span>
        </button>
      ) : null}
      {stats === null ? null : <StatsTiles stats={stats} />}
      {stats === null ? null : <WeekChart daily={stats.daily} now={now} />}
      {stats !== null && stats.daysListed !== null && stats.daysListed > 0 ? (
        <p data-owner-listed="" className="text-[13px] text-hint">
          {t("own.listedDays", { days: t("own.days", { n: stats.daysListed }) })}
        </p>
      ) : null}
      {note === null ? null : <p data-owner-note="" className="text-[13px] leading-[1.4] text-hint">{note}</p>}
      <FillHints listing={listing} />
    </section>
  );
}

function StatsTiles({ stats }: { stats: OwnerStats }) {
  const t = useTranslations();
  const tile = (id: string, label: string, value: number, extra?: string) => (
    <div key={id} data-owner-tile={id} className="flex flex-col gap-[2px] rounded-[12px] bg-bg p-[10px]">
      <span className="text-[20px] font-bold text-text tabular-nums">{value}</span>
      <span className="text-[12px] leading-[1.3] text-hint">{label}</span>
      {extra === undefined ? null : <span className="text-[12px] text-good">{extra}</span>}
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-[8px]">
      {tile("sent", t("own.stat.sent"), stats.sent)}
      {tile("opened", t("own.stat.opened"), stats.opened)}
      {tile("favorites", t("own.stat.favorites"), stats.favorites)}
      {tile("requests", t("own.stat.requests"), stats.requests, stats.given > 0 ? t("own.stat.given", { n: stats.given }) : undefined)}
    </div>
  );
}

/** «Открывали за 7 дней»: the total and seven bars from `stats.daily`, today on the right, Tashkent weekdays. */
export function WeekChart({ daily, now }: { daily: readonly number[]; now: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const labels = weekLabels(now, locale);
  const heights = barHeights(daily);
  const total = daily.reduce((sum, count) => sum + count, 0);
  return (
    <div data-owner-week={total} className="flex flex-col gap-[8px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold text-text">{t("own.week")}</span>
        <span className="text-[14px] font-semibold text-text tabular-nums">{total}</span>
      </div>
      <div className="grid h-[64px] grid-cols-7 items-end gap-[6px]" aria-hidden>
        {heights.map((height, index) => (
          <span key={index} data-bar={daily[index]} className="rounded-t-[4px] bg-accent" style={{ height: `${Math.max(height, daily[index]! > 0 ? 6 : 2)}%`, opacity: daily[index]! > 0 ? 1 : 0.25 }} />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[6px] text-center text-[11px] text-hint">
        {labels.map((label, index) => (
          <span key={index} data-day={index}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * «Чтобы объявление было полнее» (BR-APP-093, BR-APP-113): only for a manageable listing while the cabinet is on;
 * the rolling «n из 5», a five-segment bar, the open items first; a tap opens the form on the field
 * (`?focus=`) and sends `owner_hint_opened {field}`. All filled: «Объявление заполнено полностью».
 */
/** The place of the number inside a translated text, whatever the word order of the locale. */
const MARK = "\u2063";

function rolled(text: string, value: number) {
  const [before, after] = text.split(MARK);
  return after === undefined ? (
    text
  ) : (
    <>
      {before}
      <RollNumber value={value} />
      {after}
    </>
  );
}

function FillHints({ listing }: { listing: OwnerListingView }) {
  const t = useTranslations();
  const cabinetOn = useOwnerEnabled();
  if (!cabinetOn || !manageable(listing)) {
    return null;
  }
  const { filled, total, items } = fillHints(listing);
  return (
    <div data-owner-hints={filled} className="flex flex-col gap-[8px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold text-text">{t("own.panel.hintsTitle")}</span>
        <span data-owner-filled={filled} className="text-[13px] text-hint">
          {rolled(t("own.panel.filled", { n: MARK, total }), filled)}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-[4px]" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index < filled ? "h-[4px] rounded-full bg-accent" : "h-[4px] rounded-full bg-sep"} />
        ))}
      </div>
      {filled === total ? (
        <p data-owner-hints-done="" className="text-[14px] text-good">
          {t("own.panel.allFilled")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.field}>
              <button
                type="button"
                data-hint={item.field}
                data-hint-done={item.done ? "" : undefined}
                onClick={() => {
                  tg.haptic.impact("light");
                  track("owner_hint_opened", { field: item.field });
                  nav.push(routes.ownerForm(listing.id, { focus: item.field }));
                }}
                className="flex w-full items-center justify-between gap-[8px] py-[8px] text-left"
              >
                <span className={item.done ? "text-[14px] text-hint" : "text-[14px] text-text"}>{t(item.key, item.values)}</span>
                <ChevronRight size={16} aria-hidden className="text-hint" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
