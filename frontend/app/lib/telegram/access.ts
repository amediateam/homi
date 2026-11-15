import { supportsFeature } from "./gates";
import { insideTelegram } from "./sdk";

/**
 * Asks the user to let the bot write to them (TMA-033, 6.9+). `null` when the client cannot ask; the flow around
 * it (the `no_chat` radar case) is WP-30.
 */
export function requestWriteAccess(): Promise<boolean | null> {
  const app = insideTelegram();
  if (app === null || !supportsFeature(app.version, "writeAccess") || typeof app.requestWriteAccess !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      app.requestWriteAccess?.((allowed) => resolve(allowed === true));
    } catch {
      resolve(null);
    }
  });
}
