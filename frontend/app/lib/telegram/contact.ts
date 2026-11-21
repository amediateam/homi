import { supportsFeature } from "./gates";
import { insideTelegram } from "./sdk";

/**
 * Asks Telegram for the user's phone number (TMA-034, 6.9+; WP-81's phone step, DEC-72): `true` when the user shared
 * it, `false` when they declined, `null` when the client cannot ask (outside Telegram, below 6.9, no method). The
 * number goes to HOMI's bot, never to the Mini App: the callback's second argument, the contact itself, is dropped
 * unread, so nothing here can store or log it.
 */
export function requestContact(): Promise<boolean | null> {
  const app = insideTelegram();
  if (app === null || !supportsFeature(app.version, "requestContact") || typeof app.requestContact !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      app.requestContact?.((shared) => resolve(shared === true));
    } catch {
      resolve(null);
    }
  });
}
