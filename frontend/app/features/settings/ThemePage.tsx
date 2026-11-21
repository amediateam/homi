"use client";

import { ChoiceList } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { updateSettings } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { tg } from "@/lib/telegram";
import type { ThemePreference } from "@/lib/telegram/theme";
import { failed } from "@/lib/ui/feedback";

import { chooseTheme, useThemePreference } from "./themeChoice";

const THEMES: readonly ThemePreference[] = ["auto", "light", "dark"];

/**
 * «Тема» (WP-31, SCR-033): «Как в Telegram», «Светлая», «Тёмная», the current one checked. A pick of another plays a
 * light impact and re-colours the app and Telegram's header at once (`chooseTheme`), then saves; a failed save puts
 * back the last theme the server accepted, with `failed()`. Picking the current one sends nothing. Of two quick picks
 * the last one stands: only the failure of the latest save restores.
 */
export function ThemePage() {
  const t = useTranslations();
  const theme = useThemePreference();
  const save = useAction(updateSettings);
  const accepted = useRef<ThemePreference | null>(null);
  const latest = useRef(0);

  const pick = (next: ThemePreference) => {
    if (next === theme) {
      return;
    }
    accepted.current ??= theme;
    tg.haptic.impact("light");
    chooseTheme(next);
    const request = ++latest.current;
    void save({ theme: next }).then(
      (result) => {
        if (result.ok) {
          accepted.current = next;
        } else if (request === latest.current) {
          chooseTheme(accepted.current ?? "auto");
          failed();
        }
      },
      () => undefined,
    );
  };

  return (
    <ChoiceList
      aria-label={t("settings.theme._")}
      options={THEMES.map((value) => ({ value, label: t(`settings.theme.${value}`) }))}
      value={theme}
      onValueChange={pick}
    />
  );
}
