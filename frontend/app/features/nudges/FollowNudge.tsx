"use client";

import { flowRate, formatFlow, type Translate } from "@homi/i18n/format";
import type { SearchFilters } from "@homi/search";
import { cn, RadarIcon, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type ComponentProps, type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

import type { LiveFlow } from "@/features/filters/flow";
import { useSubscribe } from "@/features/radars/subscribe";
import { type DevFlags, devFlags } from "@/lib/flags";
import { tg } from "@/lib/telegram";

import { FOLLOW_SHOW_MS } from "./constants";
import { useMarkShownOnRender } from "./shown";
import type { NudgeKind } from "./store";

/**
 * The legacy `.nudge` card (`nudges.css`), shared by the follow nudge and the return banner: fixed 12 px from the
 * column's edges — not the 16 px gutter — and above the tab bar and the floating toggle at the toast's height, on the
 * nudge level of the ladder (35: above the tab bar 30 and the mini title 31, below sub-pages 40 and the listing 45).
 * A solid sheet surface in every mode, 18 px corners, legacy's own shadow, `rise-in`; a live region (`role=status`).
 * No Back handler and no tap outside: only its own buttons end it.
 */
export function NudgeFrame({ kind, children }: { kind: NudgeKind; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+78px)] z-(--z-nudge) mx-auto max-w-(--feed-max) px-[12px]">
      <div
        role="status"
        data-nudge={kind}
        className="pointer-events-auto flex animate-rise-in items-center gap-[10px] rounded-[18px] bg-sheet py-[12px] pr-[8px] pl-[14px] text-text shadow-[0_12px_32px_#00000047,0_0_0_0.5px_var(--sep)]"
      >
        {children}
      </div>
    </div>
  );
}

/** «Включить» / «Настроить» of a nudge (`.nudge-go`): 36 px, accent, 14 px bold; the medium impact is the caller's. */
export function NudgeGo({ className, ...props }: Omit<ComponentProps<"button">, "type">) {
  return (
    <button
      type="button"
      data-action="enable"
      className={cn("h-[36px] shrink-0 rounded-[18px] bg-accent px-[14px] text-[14px] font-bold text-accent-text", className)}
      {...props}
    />
  );
}

/** × of a nudge (`.nudge-x`): 30 × 30, the hint colour, named `common.close`. */
export function NudgeClose({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      data-action="close"
      aria-label={t("common.close")}
      onClick={onClose}
      className="grid size-[30px] shrink-0 place-items-center text-hint"
    >
      <X size={16} aria-hidden />
    </button>
  );
}

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
