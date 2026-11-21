"use client";

import type { Translate } from "@homi/i18n/format";
import { ChoiceList } from "@homi/ui";
import { useTranslations } from "next-intl";

import { autoIsLite, type GraphicsMode, setGraphicsMode, useGraphicsMode } from "@/lib/graphics";
import { tg } from "@/lib/telegram";

import { graphicsLabel } from "./format";

const MODES: readonly GraphicsMode[] = ["auto", "full", "lite"];

/**
 * «Графика» (WP-31, SCR-034): «Авто · полная» or «Авто · облегчённая» (what auto chooses on this device now), «Полная»,
 * «Облегчённая». Device-local, no request: a pick plays a light impact and `setGraphicsMode` writes `homi-graphics`
 * (`auto` removes it and the measured result) and toggles `html.lite`, so blur, shadows and the radar animation switch
 * at once. The hint is the page's.
 */
export function GraphicsPage() {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const { mode } = useGraphicsMode();
  const pick = (next: GraphicsMode) => {
    tg.haptic.impact("light");
    setGraphicsMode(next);
  };
  return (
    <ChoiceList
      aria-label={t("settings.graphics._")}
      options={MODES.map((value) => ({ value, label: graphicsLabel(value, value === "auto" && autoIsLite(), translate) }))}
      value={mode}
      onValueChange={pick}
    />
  );
}
