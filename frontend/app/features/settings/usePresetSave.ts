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
 * wins: an earlier answer that arrives after a later pick does not replace it, and only a failure of the latest save
 * puts back, with `failed()`, the answer of the newest save that succeeded — else the settings before the saves. The
 * server takes the saves in their order (Next sends Server Actions one at a time), so the newest success is what it
 * holds: a success of an earlier save that arrives after the latest one failed is shown, and one that arrives after a
 * later success is dropped. A failed earlier request never undoes anything.
 */
export function usePresetSave(): { settings: Settings | undefined; save: (change: SettingsInput & Partial<Settings>) => Promise<boolean> } {
  const view = useSettings();
  const send = useAction(updateSettings);
  const latest = useRef(0);
  /** The number of the newest save that succeeded. */
  const newestSuccess = useRef(0);
  /** What a failure of the latest save puts back while saves are pending; `undefined` once the latest settled. */
  const restore = useRef<Settings | undefined>(undefined);

  const save = async (change: SettingsInput & Partial<Settings>): Promise<boolean> => {
    tg.haptic.impact("light");
    const request = ++latest.current;
    const before = view.patch(change as Partial<Settings>);
    restore.current ??= before;
    const result = await send(change).catch(() => null);
    const newest = result?.ok === true && request > newestSuccess.current;
    if (newest) {
      newestSuccess.current = request;
    }
    if (request !== latest.current) {
      if (newest) {
        if (restore.current !== undefined) {
          restore.current = result.data;
        } else {
          // The latest save settled and failed (a success of it would be newer): the server holds this one.
          view.replace(result.data);
        }
      }
      return result?.ok === true;
    }
    if (result?.ok) {
      restore.current = undefined;
      view.replace(result.data);
      return true;
    }
    if (restore.current !== undefined) {
      view.replace(restore.current);
    }
    restore.current = undefined;
    failed();
    return false;
  };

  return { settings: view.settings, save };
}
