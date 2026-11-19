"use client";

import { Button, RadarIcon } from "@homi/ui";
import { useTranslations } from "next-intl";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";
import { lastSearchQuery } from "@/lib/ui/shellState";

import { RadarSweep } from "./RadarSweep";

/**
 * The radar tab without radars (SCR-027, legacy `RadarEmptyState`): the 132 px radar art with three blips (still in
 * lite graphics and with reduced motion, `RadarSweep`), «Радар следит за каналами за вас», the hint and the primary
 * «Включить радар», which plays a light impact and opens «Новый радар» with the search keys of the last search
 * (`lastSearchQuery`, as the «+» of the top bar does); without an `entry` the sheet creates with `empty`. The column
 * of legacy `empty tall`: 96 px from the top, gap 10, the hint at most 300 px wide — outside the tab's side gutters.
 */
export function RadarEmptyState() {
  const t = useTranslations();
  const create = () => {
    tg.haptic.impact();
    nav.push(routes.radarNew(lastSearchQuery()));
  };
  return (
    <div data-radar-state="empty" className="flex flex-col items-center gap-[10px] px-[24px] pt-[96px] pb-[64px] text-center text-hint">
      <RadarSweep size={132} blips={3} className="mb-[6px]" />
      <h2 className="text-[17px] font-bold text-text">{t("subs.empty")}</h2>
      <p className="max-w-[300px]">{t("subs.emptyHint")}</p>
      <Button data-radar-create="" className="mt-[10px] h-[48px] px-[20px]" onClick={create}>
        <RadarIcon size={18} />
        {t("sheet.subscribe")}
      </Button>
    </div>
  );
}
