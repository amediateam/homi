"use client";

import type { Translate } from "@homi/i18n/format";
import { ChoiceList } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useRadarsEnabled } from "@/features/radars/capability";
import { useRadars } from "@/features/radars/useRadars";

import { formatDigestHours, hoursOf } from "./format";
import { digestKey } from "./options";
import { usePresetSave } from "./usePresetSave";

/**
 * «Время подборок» (WP-31, SCR-038): the presets of the settings answer («9», «9 и 21» …), the current one checked; a
 * value in no preset checks none. A pick checks its row at once and saves (`usePresetSave`); the radar sheet reads
 * the same settings, so its «Списком в …» follows. The hint says what the hours are for when an active radar sends
 * digests, else how to switch a radar to digests; radars switched off (DEC-51) read no list and show the second.
 */
export function DigestHint() {
  const t = useTranslations();
  const enabled = useRadarsEnabled();
  const { radars } = useRadars({ enabled });
  const digests = enabled && (radars ?? []).some((radar) => radar.active && radar.mode === "digest");
  return (
    <>
      {t(digests ? "notify.digestHint" : "notify.digestHintNone")} {t("notify.tz")}
    </>
  );
}

export function DigestPage() {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const { settings, save } = usePresetSave();
  const presets = (Array.isArray(settings?.options?.digest_hours) ? settings.options.digest_hours : [])
    .map(hoursOf)
    .filter((hours): hours is number[] => hours !== null);
  if (settings === undefined || presets.length === 0) {
    return null;
  }
  const current = hoursOf(settings.digest_hours);
  const byKey = new Map(presets.map((hours) => [digestKey(hours), hours]));
  const value = current === null ? null : digestKey(current);
  return (
    <ChoiceList
      aria-label={t("notify.digest")}
      options={[...byKey].map(([key, hours]) => ({ value: key, label: formatDigestHours(hours, translate) }))}
      value={value !== null && byKey.has(value) ? value : null}
      onValueChange={(key) => {
        const hours = byKey.get(key);
        if (hours !== undefined) {
          void save({ digest_hours: hours });
        }
      }}
    />
  );
}
