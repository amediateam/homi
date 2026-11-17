"use client";

import { flowRate, formatFlow, type Translate } from "@homi/i18n/format";
import type { SearchFilters, SearchMode } from "@homi/search";
import { Button, Check, FilterChip, RadarIcon } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useRadarsEnabled } from "@/features/radars/capability";
import { useHasActiveRadar } from "@/features/radars/subscribe";
import { tg } from "@/lib/telegram";

import type { LiveFlow, LiveFlowOption } from "./useLiveStats";

export interface FiltersFooterProps {
  mode: SearchMode;
  /** The draft: «Радар включён» when an active radar has the same filters (BR-APP-012). */
  draft: SearchFilters;
  /** `useLiveStats().count`: `null` until the first answer; a failed request keeps the last one. */
  count: number | null;
  /** `useLiveStats().flow`: `null` hides the flow line and the relax chips. */
  flow: LiveFlow | null;
  /** `devFlags.dev021OneFlowVocabulary` (LB-APP-033), from the route. */
  oneVocabulary: boolean;
  /** A subscribe or save is on its way: its button is disabled. */
  submitting: boolean;
  onApply: () => void;
  onSubscribe: () => void;
  onSave: () => void;
  onRelax: (option: LiveFlowOption) => void;
}

const BUTTON = "h-[48px] min-w-0 flex-1 px-[20px] text-[16px]";

/**
 * The footer of the full filters sheet (SCR-014, SCR-029, SCR-030; legacy `SheetFooter.jsx`).
 *
 * - The flow line (BR-APP-044): `formatFlow(flowRate(flow), "sheet", …)` — «📡 Радар: ≈{n} в день», «… {n} за
 *   неделю» or «… таких не было …»; without a flow its line keeps its height, so the footer does not jump.
 * - The relax chips «{label} · {rate}» of the flow answer, server strings as text (SEC-REQ-021); a tap plays a light
 *   impact and hands the option to `onRelax`.
 * - Search mode: «Включить радар» (disabled while submitting), or ✓ «Радар включён» when a radar with these filters
 *   is on, both only while `useRadarsEnabled()` (DEC-51); then «Показать» until the first count, «Показать {n}», or
 *   «Ничего нет», which still applies.
 * - Radar modes: «Сейчас подходит: {n}» (empty until the first count) and one button, «Включить радар» for a new
 *   radar, «Сохранить» for an edit, disabled while submitting.
 */
export function FiltersFooter({
  mode,
  draft,
  count,
  flow,
  oneVocabulary,
  submitting,
  onApply,
  onSubscribe,
  onSave,
  onRelax,
}: FiltersFooterProps) {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const radarsEnabled = useRadarsEnabled();
  const radarOn = useHasActiveRadar(draft);
  const flowLine = formatFlow(flowRate(flow), "sheet", translate, { oneVocabulary });
  const options = flowLine === null ? [] : (flow?.options ?? []);

  return (
    <div data-slot="filters-footer" className="flex flex-col gap-[10px]">
      <p data-slot="flow-line" className="min-h-[18px] text-center text-[13px] leading-[18px] text-hint">
        {flowLine}
      </p>
      {options.length > 0 ? (
        <div
          data-scroll-x=""
          className="-mx-(--gutter) flex gap-[8px] overflow-x-auto overscroll-x-contain px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {options.map((option) => (
            <FilterChip
              key={option.code}
              data-relax={option.code}
              onClick={() => {
                tg.haptic.impact("light");
                onRelax(option);
              }}
              className="px-[14px]"
            >
              {`${option.label} · ${option.rate}`}
            </FilterChip>
          ))}
        </div>
      ) : null}
      {mode === "search" ? (
        <div className="flex gap-[10px]">
          {radarsEnabled ? (
            radarOn ? (
              <span
                data-state="radar-on"
                className="inline-flex h-[48px] min-w-0 flex-1 items-center justify-center gap-[6px] text-[15px] font-semibold text-good"
              >
                <Check size={18} aria-hidden />
                {t("head.followOn")}
              </span>
            ) : (
              <Button
                variant="secondary"
                data-action="subscribe"
                disabled={submitting}
                onClick={onSubscribe}
                className={BUTTON}
              >
                <RadarIcon size={18} aria-hidden />
                {t("sheet.subscribe")}
              </Button>
            )
          ) : null}
          <Button data-action="apply" onClick={onApply} className={BUTTON}>
            {count === null ? t("sheet.show") : count > 0 ? t("sheet.showN", { n: count }) : t("sheet.nothing")}
          </Button>
        </div>
      ) : (
        <>
          <p data-slot="matching-now" className="min-h-[18px] text-center text-[13px] leading-[18px] text-hint">
            {count === null ? "" : t("sheet.matchingNow", { n: count })}
          </p>
          {mode === "radar-new" ? (
            <Button data-action="subscribe" disabled={submitting} onClick={onSubscribe} className={BUTTON}>
              {t("sheet.subscribe")}
            </Button>
          ) : (
            <Button data-action="save" disabled={submitting} onClick={onSave} className={BUTTON}>
              {t("sheet.save")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
