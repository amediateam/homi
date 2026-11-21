"use client";

import { updateSettings, type SettingsInput } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { invalidate } from "@/lib/data/useResource";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { SETTINGS_KEY, type Settings, useSettings } from "./useSettings";

/**
 * The saves of the launch, shared by every preset page: each answer replaces the whole settings entry (`replace`),
 * so the latest pick of any page decides — a late answer of a page closed meanwhile must not undo a newer pick on
 * another one.
 */
const saves = { latest: 0, base: undefined as Settings | undefined, inFlight: 0, reread: false };

function begin(before: Settings | undefined): number {
  saves.base ??= before;
  saves.inFlight += 1;
  return (saves.latest += 1);
}

/** One save settled: the settings are read again once none is out, if a failure or an out-of-order settle asked. */
function settled(): void {
  saves.inFlight -= 1;
  if (saves.inFlight === 0 && saves.reread) {
    saves.reread = false;
    invalidate(SETTINGS_KEY);
  }
}

/**
 * The end of the latest pick: what it puts back on failure (the settings before the picks), and whether the settings
 * must be read again (a failure, or an earlier save still out).
 */
function finish(ok: boolean): Settings | undefined {
  const back = saves.base;
  saves.base = undefined;
  if (!ok || saves.inFlight > 1) {
    saves.reread = true;
  }
  return back;
}

/** Tests only. */
export function resetPresetSaves(): void {
  saves.latest = 0;
  saves.base = undefined;
  saves.inFlight = 0;
  saves.reread = false;
}

/**
 * The save of a preset page (WP-31, BR-APP-051: quiet hours, digest hours, card style): the change shows at once
 * (`patch`), then `PATCH /settings`. Of several saves — on any preset page of the launch — the latest pick decides:
 * earlier answers change nothing; its success replaces the settings shown with the answer, its failure puts back the
 * settings before the picks, with `failed()`. The order in which the server took the writes is not always the order
 * of the picks — Next lets a Back pass a pending action, a save is repeated after a re-authentication, a write can
 * land after its request timed out — so after a failure, or when an earlier save was still out when the latest one
 * settled, the settings are read again once every save has settled: the screen ends at what the server holds.
 */
export function usePresetSave(): { settings: Settings | undefined; save: (change: SettingsInput & Partial<Settings>) => Promise<boolean> } {
  const view = useSettings();
  const send = useAction(updateSettings);

  const save = async (change: SettingsInput & Partial<Settings>): Promise<boolean> => {
    tg.haptic.impact("light");
    const request = begin(view.patch(change as Partial<Settings>));
    const result = await send(change).catch(() => null);
    const ok = result?.ok === true;
    if (request === saves.latest) {
      const back = finish(ok);
      if (ok) {
        view.replace(result.data);
      } else {
        if (back !== undefined) {
          view.replace(back);
        }
        failed();
      }
    }
    settled();
    return ok;
  };

  return { settings: view.settings, save };
}
