"use client";

import { useRef } from "react";

import { updateSettings, type SettingsInput } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { type Settings, useSettings } from "./useSettings";

/**
 * The save of a preset page (WP-31, BR-APP-051: quiet hours, digest hours, card style): the change shows at once
 * (`patch`), then `PATCH /settings`, and the answer replaces the settings shown. Next sends Server Actions one at a time,
 * each after the answer of the one before — a save repeated after a re-authentication (`invokeAction`) joins the
 * queue again — so the answers arrive in the order the server took the writes, and the last success to arrive is what
 * it holds. While the latest pick waits, the earlier answers change nothing on screen; the latest one's success is
 * shown, its failure puts back, with `failed()`, the last success that arrived meanwhile, else the settings before the
 * saves. A success that arrives after the latest pick settled is shown: the server took it last. A failed earlier
 * request never undoes anything.
 */
export function usePresetSave(): { settings: Settings | undefined; save: (change: SettingsInput & Partial<Settings>) => Promise<boolean> } {
  const view = useSettings();
  const send = useAction(updateSettings);
  const latest = useRef(0);
  /** The settings before the first pending save; `undefined` once the latest pick settled. */
  const base = useRef<Settings | undefined>(undefined);
  /** The last success that arrived while the latest pick waited. */
  const arrived = useRef<Settings | undefined>(undefined);

  const save = async (change: SettingsInput & Partial<Settings>): Promise<boolean> => {
    tg.haptic.impact("light");
    const request = ++latest.current;
    const before = view.patch(change as Partial<Settings>);
    if (base.current === undefined) {
      base.current = before;
      arrived.current = undefined;
    }
    const result = await send(change).catch(() => null);
    const ok = result?.ok === true;
    if (request !== latest.current) {
      if (ok) {
        if (base.current !== undefined) {
          arrived.current = result.data;
        } else {
          view.replace(result.data);
        }
      }
      return ok;
    }
    if (ok) {
      view.replace(result.data);
    } else {
      const back = arrived.current ?? base.current;
      if (back !== undefined) {
        view.replace(back);
      }
      failed();
    }
    base.current = undefined;
    arrived.current = undefined;
    return ok;
  };

  return { settings: view.settings, save };
}
