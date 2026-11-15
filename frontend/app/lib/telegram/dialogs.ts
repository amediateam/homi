import { supportsFeature } from "./gates";
import { insideTelegram } from "./sdk";

function browserConfirm(text: string): boolean {
  try {
    return window.confirm(text);
  } catch {
    return false;
  }
}

/** A yes/no question (TMA-026): Telegram's `showConfirm` from 6.2, else `window.confirm`. */
export function confirm(text: string): Promise<boolean> {
  const app = insideTelegram();
  if (app === null || !supportsFeature(app.version, "confirm") || typeof app.showConfirm !== "function") {
    return Promise.resolve(browserConfirm(text));
  }
  return new Promise((resolve) => {
    try {
      app.showConfirm?.(text, (confirmed) => resolve(confirmed === true));
    } catch {
      resolve(browserConfirm(text));
    }
  });
}
