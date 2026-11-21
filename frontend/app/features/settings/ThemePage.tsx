"use client";

import { ChoiceList } from "@homi/ui";
import { useTranslations } from "next-intl";

import { updateSettings } from "@/lib/actions/settings";
import { type DevFlags, devFlags } from "@/lib/flags";
import { useAction } from "@/lib/actions/useAction";
import { patchMe } from "@/lib/session/bootstrap";
import { tg } from "@/lib/telegram";
import type { ThemePreference } from "@/lib/telegram/theme";
import { failed } from "@/lib/ui/feedback";

import { chooseTheme, useThemePreference } from "./themeChoice";

const THEMES: readonly ThemePreference[] = ["auto", "light", "dark"];

/** The theme saves of the launch, shared by every mount of the page. */
const themeSaves = { latest: 0, before: null as ThemePreference | null };

function beginTheme(current: ThemePreference): number {
  themeSaves.before ??= current;
  return (themeSaves.latest += 1);
}

/** The latest pick settled: the theme before the picks; `null` for an earlier pick, which decides nothing. */
function finishTheme(request: number): ThemePreference | null {
  if (request !== themeSaves.latest) {
    return null;
  }
  const back = themeSaves.before ?? "auto";
  themeSaves.before = null;
  return back;
}

/** Tests only. */
export function resetThemeSaves(): void {
  themeSaves.latest = 0;
  themeSaves.before = null;
}

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
  const pick = (next: ThemePreference) => {
    if (next === theme) {
      return;
    }
    tg.haptic.impact("light");
    const request = beginTheme(theme);
    chooseTheme(next);
    const settle = (ok: boolean) => {
      // Only the latest pick of the launch decides (a page closed meanwhile included); an earlier answer changes nothing.
      const back = finishTheme(request);
      if (back === null) {
        return;
      }
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
