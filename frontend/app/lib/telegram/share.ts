import { supportsFeature } from "./gates";
import { openLink } from "./links";
import { insideTelegram, webView } from "./sdk";

/** The SDK's error for a share window it still believes open (TMA-030). */
const STALE_WINDOW = "WebAppShareMessageOpened";

const isStale = (error: unknown): boolean => error instanceof Error && error.message.includes(STALE_WINDOW);

/**
 * Sends a prepared message through the share picker (TMA-030, 8.0+). When the SDK still holds a stale window, the
 * SDK's own `prepared_message_failed` event resets it and the call is retried once. If the SDK no longer offers
 * that entry point the answer is `false`: an SDK change then fails `tests/telegram/share.test.ts`, not the user.
 */
export function shareMessage(preparedId: string): Promise<boolean> {
  const app = insideTelegram();
  if (app === null || !supportsFeature(app.version, "shareMessage") || typeof app.shareMessage !== "function") {
    return Promise.resolve(false);
  }
  const send = (): Promise<boolean> =>
    new Promise((resolve, reject) => {
      try {
        app.shareMessage?.(preparedId, (sent) => resolve(sent === true));
      } catch (error) {
        reject(error);
      }
    });
  return send().catch((error: unknown) => {
    if (!isStale(error)) {
      throw error;
    }
    const view = webView();
    if (typeof view?.receiveEvent !== "function") {
      return false;
    }
    view.receiveEvent("prepared_message_failed", { error: "UNKNOWN_ERROR" });
    return send().catch((retry: unknown) => {
      if (isStale(retry)) {
        return false;
      }
      throw retry;
    });
  });
}

/** Shares an address (TMA-031): `t.me/share/url` inside Telegram; outside `navigator.share`, else a new tab. */
export async function shareUrl(url: string, text: string): Promise<void> {
  const target = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (insideTelegram() !== null && openLink(target)) {
    return;
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, text });
    } catch {
      // Cancelled by the user.
    }
    return;
  }
  try {
    window.open(target, "_blank", "noopener");
  } catch {
    // Nothing else to try.
  }
}

/**
 * Shares a ready message (WP-82, TMA-048: the landlord block): inside Telegram `t.me/share/url` with the whole text in
 * `url`, as legacy — LB-APP-090 is not adopted, since legacy's message carries its link inside the text, which a
 * separate `text` would repeat; else `navigator.share({ text })` with its errors swallowed; else a new tab.
 */
export async function shareText(text: string): Promise<void> {
  const target = `https://t.me/share/url?url=${encodeURIComponent(text)}`;
  if (insideTelegram() !== null && openLink(target)) {
    return;
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
    } catch {
      // Cancelled by the user.
    }
    return;
  }
  try {
    window.open(target, "_blank", "noopener");
  } catch {
    // Nothing else to try.
  }
}
