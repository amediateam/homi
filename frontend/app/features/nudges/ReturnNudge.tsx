"use client";

import type { Locale } from "@homi/config";
import { formatCount, type Translate } from "@homi/i18n/format";
import { isCustomFilters, type SearchFilters, toSearchParams } from "@homi/search";
import { RadarIcon } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";

import { useSubscribe } from "@/features/radars/subscribe";
import { type DevFlags, devFlags } from "@/lib/flags";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { RETURN_SHOW_MS } from "./constants";
import { NudgeClose, NudgeFrame, NudgeGo } from "./FollowNudge";
import { useMarkShownOnRender } from "./shown";

/** «С вашего прошлого захода — 12 новых»: the banner's title, which `NudgeHost` also announces. */
export function returnTitle(count: number, locale: Locale, translate: Translate): string {
  return translate("back.title", { count: formatCount(count, "back.new", locale, translate) });
}

export interface ReturnNudgeProps {
  /** The search the banner counts new listings for. */
  filters: SearchFilters;
  /** The positive integer count of `GET /listings/new`. */
  count: number;
  /** The marks of the first render (`back[hash]`, `lastShown`, `asked`, `return_prompt_shown`), once per banner. */
  onShown: () => void;
  /** 15 s after this mount. */
  onExpire: () => void;
  /** ×. */
  onClose: () => void;
  /** «Включить» / «Настроить», before the card acts: the host ends the banner and resets the close streak. */
  onEnable: () => void;
  /** The app's flags; tests pass overrides. */
  flags?: DevFlags;
}

/**
 * The return banner (SCR-046, BR-APP-071; legacy `ReturnNudge` of `Nudges.jsx`) on the follow nudge's `.nudge` card:
 * the radar icon; the bold «С вашего прошлого захода — {count}», `{count}` being the number in the number locale and
 * the plural `back.new` («12 новых», uz «12 ta yangi», en «12 new»); the hint «Радар пришлёт следующие сразу — узнаете о
 * них первыми», which wraps instead of being cut; «Включить» for custom filters or «Настроить» for default ones; ×.
 *
 * Its 15 s run from each mount, as in legacy: a banner suspended by a toast or a layer comes back with a fresh timer.
 * The marks run once, on its first render in the slot (`useMarkShownOnRender`, LB-APP-050). The button plays a medium
 * impact and lets the host end the banner; custom filters then turn the radar on through the subscribe flow (`entry:
 * "return"`, BR-APP-073), whose toast says how it went, and default filters open «Новый радар» with this search and
 * `entry=return`, which its create sends.
 */
export function ReturnNudge({ filters, count, onShown, onExpire, onClose, onEnable, flags = devFlags }: ReturnNudgeProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key, values);
  const { subscribe } = useSubscribe({ flags });
  const expire = useRef(onExpire);
  const custom = isCustomFilters(filters);

  useMarkShownOnRender("return", onShown);

  useLayoutEffect(() => {
    expire.current = onExpire;
  });

  useEffect(() => {
    const timer = setTimeout(() => expire.current(), RETURN_SHOW_MS);
    return () => clearTimeout(timer);
  }, []);

  const act = () => {
    tg.haptic.impact("medium");
    onEnable();
    if (custom) {
      void subscribe(filters, "return");
    } else {
      nav.push(routes.radarNew(toSearchParams(filters), "return"));
    }
  };

  return (
    <NudgeFrame kind="return">
      <RadarIcon size={20} aria-hidden className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-px leading-[1.3]">
        <b className="text-[14px] font-semibold">{returnTitle(count, locale, translate)}</b>
        <span className="text-[12.5px] text-hint">{t("back.what")}</span>
      </div>
      <NudgeGo onClick={act}>{t(custom ? "nudge.enable" : "nudge.setup")}</NudgeGo>
      <NudgeClose onClose={onClose} />
    </NudgeFrame>
  );
}
