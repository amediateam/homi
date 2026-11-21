"use client";

import type { Locale } from "@homi/config";
import { isLocale } from "@homi/config";
import { ChoiceList } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { updateSettings } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { changeLanguage } from "./applyProfileChange";
import { namedOptions } from "./options";
import { useSettings } from "./useSettings";

/**
 * «Язык» (WP-31, SCR-035): the languages of the settings answer, the address's locale checked. A pick plays a light
 * impact, disables the rows and saves; on success `changeLanguage` switches the address segment, so texts, number
 * formats and the check move in place — the open page stays open, the session maps, the filters of the address and
 * the scroll below survive, and no second launch event is sent. A failure changes nothing, with `failed()`. While a
 * save runs the rows are disabled, so a second pick waits for the first by construction.
 */
export function LanguagePage() {
  const t = useTranslations();
  const locale = useLocale();
  const { settings } = useSettings();
  const save = useAction(updateSettings);
  const [saving, setSaving] = useState(false);

  const pick = (next: string) => {
    if (saving || next === locale || !isLocale(next)) {
      return;
    }
    tg.haptic.impact("light");
    setSaving(true);
    void save({ locale: next as Locale }).then(
      (result) => {
        setSaving(false);
        if (result.ok) {
          changeLanguage(next as Locale);
        } else {
          failed();
        }
      },
      () => setSaving(false),
    );
  };

  const options = namedOptions(settings?.options?.locales);
  if (options.length === 0) {
    return null;
  }
  return (
    <ChoiceList
      aria-label={t("notify.language")}
      options={options.map(({ code, name }) => ({ value: code, label: name, disabled: saving }))}
      value={locale}
      onValueChange={pick}
    />
  );
}
