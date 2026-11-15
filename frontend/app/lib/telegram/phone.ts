import { openLink } from "./links";
import { platform } from "./sdk";

/** TMA-029: leaving the app within this long after `tel:` counts as a call. */
export const TEL_DETECTION_MS = 1200;

/** Only an Uzbek number in full international form is dialled directly. */
const DIALLABLE = /^\+998\d{9}$/;

function dial(href: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.click();
}

/**
 * Calls the author (TMA-029). On Android a diallable number goes to `tel:` first; if the app is not left within
 * 1.2 s, the call page `callUrl` opens instead. Other platforms open the call page. `null` when nothing opened;
 * WP-26 logs `contact_call` only for a non-null result.
 */
export function call(phone: string, callUrl: string | null): Promise<"tel" | "browser" | null> {
  const openPage = (): "browser" | null => (callUrl !== null && openLink(callUrl) ? "browser" : null);
  if (!platform().startsWith("android") || !DIALLABLE.test(phone)) {
    return Promise.resolve(openPage());
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: "tel" | "browser" | null): void => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onLeave);
      resolve(result);
    };
    const onLeave = (): void => finish("tel");
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        finish("tel");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onLeave);
    const timer = setTimeout(() => finish(openPage()), TEL_DETECTION_MS);
    dial(`tel:${phone}`);
  });
}
