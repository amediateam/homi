"use client";

import { useRef } from "react";

import { updateSettings, type SettingsInput } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { type Settings, useSettings } from "./useSettings";

/**
 * The save of a preset page (WP-31, BR-APP-051: quiet hours, digest hours, card style): the change shows at once
 * (`patch`), then `PATCH /settings`, and the answer replaces the settings shown. Of several saves the latest one
 * wins: an earlier answer that arrives after a later pick is dropped, and only a failure of the latest save puts back
 * the settings the server last confirmed, with `failed()`; a failed earlier request never undoes a later success.
 */
export function usePresetSave(): { settings: Settings | undefined; save: (change: SettingsInput & Partial<Settings>) => Promise<boolean> } {
  const view = useSettings();
  const send = useAction(updateSettings);
  const latest = useRef(0);
  const confirmed = useRef<Settings | undefined>(undefined);

  const save = async (change: SettingsInput & Partial<Settings>): Promise<boolean> => {
    tg.haptic.impact("light");
    const request = ++latest.current;
    const before = view.patch(change as Partial<Settings>);
    confirmed.current ??= before;
    const result = await send(change).catch(() => null);
    if (request !== latest.current) {
      if (result?.ok) {
        confirmed.current = result.data;
      }
      return Boolean(result?.ok);
    }
    if (result?.ok) {
      confirmed.current = undefined;
      view.replace(result.data);
      return true;
    }
    if (confirmed.current !== undefined) {
      view.replace(confirmed.current);
    }
    confirmed.current = undefined;
    failed();
    return false;
  };

  return { settings: view.settings, save };
}
