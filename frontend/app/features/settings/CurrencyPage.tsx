"use client";

import { type Currency, currencies } from "@homi/config";
import { ChoiceList } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { updateSettings } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { changeCurrency } from "./applyProfileChange";
import { namedOptions } from "./options";
import { useSettings } from "./useSettings";

const isCurrency = (value: string): value is Currency => (currencies as readonly string[]).includes(value);

/**
 * «Валюта» (WP-31, SCR-036): the currencies of the settings answer, the profile's checked. A pick plays a light
 * impact, disables the rows and saves; on success `changeCurrency` gives the profile the new currency, renders the
 * server parts again and reads every client resource again, so prices switch in place and the page stays open. A
 * failure changes nothing, with `failed()`.
 */
export function CurrencyPage() {
  const t = useTranslations();
  const router = useRouter();
  const { me } = useSession();
  const { settings } = useSettings();
  const save = useAction(updateSettings);
  const [saving, setSaving] = useState(false);
  const current = me?.currency ?? settings?.currency ?? null;

  const pick = (next: string) => {
    if (saving || next === current || !isCurrency(next)) {
      return;
    }
    tg.haptic.impact("light");
    setSaving(true);
    void save({ currency: next }).then(
      (result) => {
        setSaving(false);
        if (result.ok) {
          changeCurrency(next, () => router.refresh());
        } else {
          failed();
        }
      },
      () => setSaving(false),
    );
  };

  const options = namedOptions(settings?.options?.currencies);
  if (options.length === 0) {
    return null;
  }
  return (
    <ChoiceList
      aria-label={t("notify.currency")}
      options={options.map(({ code, name }) => ({ value: code, label: name, disabled: saving }))}
      value={current}
      onValueChange={pick}
    />
  );
}
