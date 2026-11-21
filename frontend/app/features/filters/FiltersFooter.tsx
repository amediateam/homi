"use client";

import { flowParts, flowRate, formatFlow, type Translate } from "@homi/i18n/format";
import type { SearchFilters, SearchMode } from "@homi/search";
import { Button, Check, FilterChip, RadarIcon, saveButtonProps, type SavePhase, SaveState } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useRadarsEnabled } from "@/features/radars/capability";
import { useHasActiveRadar } from "@/features/radars/match";
import { tg } from "@/lib/telegram";
import { rollText } from "@/lib/ui/rollText";

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
  /** The phase of the subscribe or save button (`useSavePhase` of its owner); `idle` without one. */
  phase?: SavePhase;
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
 * - The numbers roll (WP-39, BR-APP-113): the flow's count, «Показать {n}» between counts above 0 and «Сейчас
 *   подходит: {n}» to and from 0. «Включить радар» and «Сохранить» show their owner's save phase (BR-APP-114): the
 *   spinner while the request runs, the tick before the sheet closes.
 */
export function FiltersFooter({
  mode,
  draft,
  count,
  flow,
  oneVocabulary,
  submitting,
  phase = "idle",
  onApply,
  onSubscribe,
  onSave,
  onRelax,
}: FiltersFooterProps) {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const radarsEnabled = useRadarsEnabled();
  // Only search mode shows the ✓: the radar forms send no plain radar read (the radar tab reads its own list only).
  const radarOn = useHasActiveRadar(draft, mode === "search");
  const rate = flowRate(flow);
  const flowLine = formatFlow(rate, "sheet", translate, { oneVocabulary });
  const flowNumber = flowParts(rate, "sheet", { oneVocabulary });
  const options = flowLine === null ? [] : (flow?.options ?? []);

  return (
    <div data-slot="filters-footer" className="flex flex-col gap-[10px]">
      <p data-slot="flow-line" className="min-h-[18px] text-center text-[13px] leading-[18px] text-hint">
        {flowNumber === null ? flowLine : rollText((n) => t(flowNumber.key, { n }), flowNumber.n)}
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
            // The list is read again before the tick was drawn: the button stays until its save is over.
            radarOn && phase === "idle" ? (
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
                {...saveButtonProps(phase)}
              >
                <SaveState phase={phase}>
                  <RadarIcon size={18} aria-hidden />
                  {t("sheet.subscribe")}
                </SaveState>
              </Button>
            )
          ) : null}
          <Button data-action="apply" onClick={onApply} className={BUTTON}>
            {count === null ? t("sheet.show") : count > 0 ? rollText((n) => t("sheet.showN", { n }), count) : t("sheet.nothing")}
          </Button>
        </div>
      ) : (
        <>
          <p data-slot="matching-now" className="min-h-[18px] text-center text-[13px] leading-[18px] text-hint">
            {count === null ? "" : rollText((n) => t("sheet.matchingNow", { n }), count)}
          </p>
          {mode === "radar-new" ? (
            <Button data-action="subscribe" disabled={submitting} onClick={onSubscribe} className={BUTTON} {...saveButtonProps(phase)}>
              <SaveState phase={phase}>{t("sheet.subscribe")}</SaveState>
            </Button>
          ) : (
            <Button data-action="save" disabled={submitting} onClick={onSave} className={BUTTON} {...saveButtonProps(phase)}>
              <SaveState phase={phase}>{t("sheet.save")}</SaveState>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
