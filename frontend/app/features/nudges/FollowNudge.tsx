"use client";

import { flowRate, formatFlow, type Translate } from "@homi/i18n/format";
import type { SearchFilters } from "@homi/search";
import { RadarIcon } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { LiveFlow } from "@/features/filters/flow";
import { useSubscribe } from "@/features/radars/subscribe";
import { type DevFlags, devFlags } from "@/lib/flags";
import { tg } from "@/lib/telegram";

import { FOLLOW_SHOW_MS } from "./constants";
import { NudgeClose, NudgeFrame, NudgeGo } from "./NudgeFrame";
import { useMarkShownOnRender } from "./shown";


export interface FollowNudgeProps {
  /** The applied filters the nudge offers a radar for. */
  filters: SearchFilters;
  /** `null`: no flow line (an empty or failed `GET /listings/flow`, LB-APP-006). */
  flow: LiveFlow | null;
  /** The marks of the first render (`asked`, `lastShown`, `follow_prompt_shown`), once per nudge. */
  onShown: () => void;
  /** 10 s after this mount. */
  onExpire: () => void;
  /** ×. */
  onClose: () => void;
  /** «Включить», before the radar is turned on: the host ends the nudge and resets the close streak. */
  onEnable: () => void;
  /** The app's flags; tests pass overrides. `dev021OneFlowVocabulary` words the flow line. */
  flags?: DevFlags;
}

/**
 * The follow nudge (SCR-040, legacy `AlertNudge` of `Nudges.jsx`): the radar icon, «Включить радар по этому поиску?»,
 * «Новые — сразу в чат», the flow line of `formatFlow(…, "nudge")` — «Таких пока нет — радар пришлёт, как появятся»,
 * «{n} за неделю», «≈{n} в день», or none — then «Включить» and ×.
 *
 * Its 10 s run from each mount, as in legacy: a nudge suspended by a toast or a layer comes back with a fresh timer.
 * The marks run once, on its first render in the slot (`useMarkShownOnRender`, LB-APP-050). «Включить» plays a medium
 * impact, lets the host end the nudge, then turns the radar on through the subscribe flow (`entry: "prompt"`), whose
 * toast says how it went.
 */
export function FollowNudge({ filters, flow, onShown, onExpire, onClose, onEnable, flags = devFlags }: FollowNudgeProps) {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const { subscribe } = useSubscribe({ flags });
  const expire = useRef(onExpire);

  useMarkShownOnRender("follow", onShown);

  useLayoutEffect(() => {
    expire.current = onExpire;
  });

  useEffect(() => {
    const timer = setTimeout(() => expire.current(), FOLLOW_SHOW_MS);
    return () => clearTimeout(timer);
  }, []);

  const flowLine = formatFlow(flowRate(flow), "nudge", translate, { oneVocabulary: flags.dev021OneFlowVocabulary });
  const enable = () => {
    tg.haptic.impact("medium");
    onEnable();
    void subscribe(filters, "prompt");
  };

  return (
    <NudgeFrame kind="follow">
      <RadarIcon size={20} aria-hidden className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-px leading-[1.3]">
        <b className="text-[14px] font-semibold">{t("nudge.title")}</b>
        <span className="truncate text-[12.5px] text-hint">{t("nudge.what")}</span>
        {flowLine === null ? null : (
          <span data-slot="nudge-flow" className="truncate text-[12.5px] text-hint">
            {flowLine}
          </span>
        )}
      </div>
      <NudgeGo onClick={enable}>{t("nudge.enable")}</NudgeGo>
      <NudgeClose onClose={onClose} />
    </NudgeFrame>
  );
}
