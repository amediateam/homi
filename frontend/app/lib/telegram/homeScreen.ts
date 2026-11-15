import { supportsFeature } from "./gates";
import { attempt, insideTelegram, safeCallback } from "./sdk";
import type { TgHomeScreenStatus } from "./types";

/** TMA-036: a status that does not arrive within this long is `unknown`. */
export const HOME_SCREEN_TIMEOUT_MS = 1500;

function manager() {
  const app = insideTelegram();
  return app !== null && supportsFeature(app.version, "homeScreen") ? app : null;
}

/** The home-screen shortcut (TMA-036, 8.0+); the offer around it is WP-31. */
export const homeScreen = {
  status(): Promise<TgHomeScreenStatus> {
    const app = manager();
    if (app === null || typeof app.checkHomeScreenStatus !== "function") {
      return Promise.resolve("unsupported");
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve("unknown"), HOME_SCREEN_TIMEOUT_MS);
      try {
        app.checkHomeScreenStatus?.((status) => {
          clearTimeout(timer);
          resolve(status ?? "unknown");
        });
      } catch {
        clearTimeout(timer);
        resolve("unknown");
      }
    });
  },
  add(): void {
    attempt(() => manager()?.addToHomeScreen?.());
  },
  onAdded(callback: () => void): () => void {
    const app = manager();
    if (app === null) {
      return () => undefined;
    }
    const wrapped = safeCallback(callback);
    attempt(() => app.onEvent?.("homeScreenAdded", wrapped));
    return () => attempt(() => app.offEvent?.("homeScreenAdded", wrapped));
  },
};
