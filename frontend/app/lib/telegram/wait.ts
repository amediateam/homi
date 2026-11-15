import { bootState, postBridgeEvent, sdkTag, webApp } from "./sdk";

/** How the SDK wait ended; `app_launch` reports it as `sdk`. */
export type SdkOutcome = "ready" | "absent" | "error" | "timeout";

/** TMA-004: the app starts without the SDK after at most this long. */
export const SDK_WAIT_MS = 3000;

/**
 * Waits for the SDK tag (TMA-004). Resolves at once when the SDK is there, the tag is missing or the boot script saw
 * it fail; otherwise on its load, its error or after `timeoutMs`. A late SDK that carries launch data is adopted
 * once: `onLate` runs, and the caller runs `initTelegramApp` again. Without an SDK the app tells Telegram itself that
 * it is ready (TMA-005), so the loading animation stops even when telegram.org is unreachable.
 */
export function waitForSdk(timeoutMs: number = SDK_WAIT_MS, onLate?: () => void): Promise<SdkOutcome> {
  return new Promise((resolve) => {
    const settle = (outcome: SdkOutcome): void => {
      if (outcome !== "ready") {
        postBridgeEvent("web_app_ready");
        postBridgeEvent("web_app_expand");
      }
      resolve(outcome);
    };

    if (webApp() !== null) {
      resolve("ready");
      return;
    }
    const tag = sdkTag();
    if (tag === null) {
      settle("absent");
      return;
    }
    const seen = bootState()?.sdk;
    if (seen === "error" || seen === "ok") {
      // "ok" without an SDK object means the script ran but did not install the SDK.
      settle("error");
      return;
    }

    let done = false;
    const finish = (outcome: SdkOutcome): void => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      tag.removeEventListener("error", onError);
      settle(outcome);
    };
    const onLoad = (): void => {
      if (!done) {
        tag.removeEventListener("load", onLoad);
        finish(webApp() !== null ? "ready" : "error");
        return;
      }
      if ((webApp()?.initData ?? "") !== "") {
        // Adopted once: a second load event finds no listener.
        tag.removeEventListener("load", onLoad);
        onLate?.();
      }
    };
    const onError = (): void => finish("error");
    tag.addEventListener("load", onLoad);
    tag.addEventListener("error", onError);
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
  });
}
