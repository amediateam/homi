"use client";

import { Smartphone } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";

import { NudgeClose, NudgeFrame, NudgeGo } from "./NudgeFrame";
import { HOME_SHOW_MS } from "./useHomeScreenOffer";

/**
 * The home-screen card (WP-31, SCR-041; legacy `HomeScreenNudge` of `Nudges.jsx`): the smartphone icon, «HOMI на
 * экране телефона», «Открывать в одно касание, как обычное приложение», «Добавить» and ×. It hides itself 10 s after
 * it rendered; no Back handler, and a tap outside does not close it.
 */
export function HomeScreenNudge({ onExpire, onClose, onAdd }: { onExpire: () => void; onClose: () => void; onAdd: () => void }) {
  const t = useTranslations();
  const expire = useRef(onExpire);
  useLayoutEffect(() => {
    expire.current = onExpire;
  });
  useEffect(() => {
    const timer = setTimeout(() => expire.current(), HOME_SHOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <NudgeFrame kind="home">
      <Smartphone size={20} aria-hidden className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-px leading-[1.3]">
        <b className="text-[14px] font-semibold">{t("home.title")}</b>
        <span className="truncate text-[12.5px] text-hint">{t("home.what")}</span>
      </div>
      <NudgeGo onClick={onAdd}>{t("home.add")}</NudgeGo>
      <NudgeClose onClose={onClose} />
    </NudgeFrame>
  );
}
