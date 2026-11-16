import { type DevFlags, devFlags } from "@/lib/flags";
import { tg } from "@/lib/telegram";

import { showToast } from "./toast";

/**
 * A save failed where legacy only vibrates (LB-APP-027): the error haptic; with DEV-016 on, also the toast
 * «Не получилось сохранить». The flags come in an options object, so `promise.catch(failed)` still reads the app's.
 */
export function failed(options?: { flags?: DevFlags }): void {
  const flags = options?.flags ?? devFlags;
  tg.haptic.error();
  if (flags.dev016ErrorToastOnFailure) {
    showToast({ key: "common.saveFailed" });
  }
}

/** A save succeeded: the success haptic. */
export function saved(): void {
  tg.haptic.success();
}
