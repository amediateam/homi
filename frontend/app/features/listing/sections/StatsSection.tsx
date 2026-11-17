"use client";

import type { Locale } from "@homi/config";
import { formatNumber } from "@homi/i18n/format";
import { useLocale, useTranslations } from "next-intl";

import type { ListingDetails } from "../listingData";

/**
 * The stats cells (BR-APP-068): days on the market («Сегодня на рынке» at 0), publications, channels only when more
 * than one, views only when known and not zero. Each cell is the value over its counted noun.
 */
export function StatsSection({ stats }: { stats: ListingDetails["stats"] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const cells: { name: string; value: string; label: string }[] = [
    stats.days_listed === 0
      ? { name: "days", value: t("details.today"), label: t("details.onMarket") }
      : { name: "days", value: String(stats.days_listed), label: t("details.daysOnMarket", { n: stats.days_listed }) },
    { name: "publications", value: String(stats.publications), label: t("details.publications", { n: stats.publications }) },
  ];
  if (stats.channels > 1) {
    cells.push({ name: "channels", value: String(stats.channels), label: t("details.channels", { n: stats.channels }) });
  }
  if (stats.views !== null && stats.views !== 0) {
    cells.push({ name: "views", value: formatNumber(stats.views, locale), label: t("details.views", { n: stats.views }) });
  }

  return (
    <section data-section="stats" className="px-(--gutter) py-[12px]">
      <div className="grid auto-cols-fr grid-flow-col gap-[8px]">
        {cells.map((cell) => (
          <div key={cell.name} data-stat={cell.name} className="flex min-w-0 flex-col rounded-medium bg-fill px-[10px] py-[10px]">
            <b className="text-[17px] leading-tight font-bold">{cell.value}</b>
            <span className="text-[13px] leading-snug text-hint">{cell.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
