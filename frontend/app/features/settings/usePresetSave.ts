"use client";

import { useRef } from "react";

import { updateSettings, type SettingsInput } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { type Settings, useSettings } from "./useSettings";

/**
 * The save of a preset page (WP-31, BR-APP-051: quiet hours, digest hours, card style): the change shows at once
 * (`patch`), then `PATCH /settings`. Of several saves the latest pick decides: earlier answers change nothing; its
 * success replaces the settings shown with the answer, its failure puts back the settings before the saves, with
 * `failed()`. The order in which the server took the writes is not always the order of the picks — Next lets a Back
 * pass a pending action, a save is repeated after a re-authentication, a write can land after its request timed out —
 * so after a failure, or when an earlier save was still out when the latest one settled, the settings are read again
 * once every save has settled: the screen ends at what the server holds.
 */
export function usePresetSave(): { settings: Settings | undefined; save: (change: SettingsInput & Partial<Settings>) => Promise<boolean> } {
  const view = useSettings();
  const send = useAction(updateSettings);
  const latest = useRef(0);
  /** The settings before the first save of the pending picks. */
  const base = useRef<Settings | undefined>(undefined);
  const inFlight = useRef(0);
  const reread = useRef(false);

  const settled = () => {
    inFlight.current -= 1;
    if (inFlight.current === 0 && reread.current) {
      reread.current = false;
      void view.refetch();
    }
  };

  const save = async (change: SettingsInput & Partial<Settings>): Promise<boolean> => {
    tg.haptic.impact("light");
    const request = ++latest.current;
    const before = view.patch(change as Partial<Settings>);
    base.current ??= before;
    inFlight.current += 1;
    const result = await send(change).catch(() => null);
    const ok = result?.ok === true;
    if (request !== latest.current) {
      settled();
      return ok;
    }
    const back = base.current;
    base.current = undefined;
    if (ok) {
      view.replace(result.data);
    } else {
      if (back !== undefined) {
        view.replace(back);
      }
      failed();
      reread.current = true;
    }
    if (inFlight.current > 1) {
      reread.current = true;
    }
    settled();
    return ok;
  };

  return { settings: view.settings, save };
}
