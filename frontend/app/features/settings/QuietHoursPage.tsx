"use client";

import type { Translate } from "@homi/i18n/format";
import { ChoiceList } from "@homi/ui";
import { useTranslations } from "next-intl";

import { quietLabel, quietOf } from "./format";
import { quietKey } from "./options";
import { usePresetSave } from "./usePresetSave";

/**
 * «Тихие часы» (WP-31, SCR-037): the presets of the settings answer («Выкл», «23–08» …), the current one checked; a
 * value in no preset (set in the bot) checks none. A pick checks its row at once and saves (`usePresetSave`); picking
 * the checked row sends nothing. An empty preset list shows only the hint.
 */
export function QuietHoursPage() {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const { settings, save } = usePresetSave();
  const presets = (Array.isArray(settings?.options?.quiet_hours) ? settings.options.quiet_hours : [])
    .map(quietOf)
    .filter((value): value is NonNullable<ReturnType<typeof quietOf>> | null => value !== undefined);
  if (settings === undefined || presets.length === 0) {
    return null;
  }
  const current = quietOf(settings.quiet_hours);
  const value = current === undefined ? null : quietKey(current);
  const byKey = new Map(presets.map((preset) => [quietKey(preset), preset]));
  return (
    <ChoiceList
      aria-label={t("notify.quiet")}
      options={[...byKey].map(([key, preset]) => ({ value: key, label: quietLabel(preset, translate) }))}
      value={value !== null && byKey.has(value) ? value : null}
      onValueChange={(key) => {
        const preset = byKey.get(key);
        if (preset !== undefined) {
          void save({ quiet_hours: preset });
        }
      }}
    />
  );
}
