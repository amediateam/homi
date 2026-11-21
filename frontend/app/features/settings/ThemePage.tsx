"use client";

import { ChoiceList } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { updateSettings } from "@/lib/actions/settings";
import { type DevFlags, devFlags } from "@/lib/flags";
import { useAction } from "@/lib/actions/useAction";
import { patchMe } from "@/lib/session/bootstrap";
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
export function ThemePage({ flags = devFlags }: { flags?: DevFlags } = {}) {
  const t = useTranslations();
  const theme = useThemePreference();
  const save = useAction(updateSettings);
  /** The theme before the first of the pending picks. */
  const before = useRef<ThemePreference | null>(null);
  const latest = useRef(0);

  const pick = (next: ThemePreference) => {
    if (next === theme) {
      return;
    }
    before.current ??= theme;
    tg.haptic.impact("light");
    chooseTheme(next);
    const request = ++latest.current;
    const settle = (ok: boolean) => {
      // Only the latest pick decides; an earlier answer changes nothing.
      if (request !== latest.current) {
        return;
      }
      const back = before.current ?? "auto";
      before.current = null;
      if (ok) {
        // A re-authentication between the pick and its repeat applies the profile's old theme again: the success puts
        // the pick back, and the session's profile takes it.
        chooseTheme(next);
        patchMe({ theme: next });
      } else {
        chooseTheme(back);
        failed({ flags });
      }
    };
    void save({ theme: next }).then(
      (result) => settle(result.ok),
      () => settle(false),
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
