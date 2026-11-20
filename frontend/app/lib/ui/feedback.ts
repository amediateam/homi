import { type DevFlags, devFlags } from "@/lib/flags";
import { tg } from "@/lib/telegram";

import { showToast } from "./toast";

/**
 * A save failed (LB-APP-027, fixed in legacy since `index-CIa0Ldj2.js`): the error haptic, and the toast «Не
 * получилось сохранить» with `dev016ErrorToastOnFailure` (on by default, DEC-58). `toast: false` keeps the haptic alone:
 * the contact failures of the listing, which legacy still only vibrates, and the first-launch language picker, which
 * shows the text under its list. The options come in an object, so `promise.catch(failed)` still reads the app's flags.
 */
export function failed(options?: { flags?: DevFlags; toast?: boolean }): void {
  const flags = options?.flags ?? devFlags;
  tg.haptic.error();
  if (options?.toast !== false && flags.dev016ErrorToastOnFailure) {
    showToast({ key: "common.saveFailed" });
  }
}

/** A save succeeded: the success haptic. */
export function saved(): void {
  tg.haptic.success();
}
