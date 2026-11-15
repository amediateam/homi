import { supportsFeature } from "./gates";
import { attempt, safeCallback, webApp } from "./sdk";
import type { TgButton } from "./types";

function button(pick: () => TgButton | null) {
  return {
    available(): boolean {
      return pick() !== null;
    },
    setVisible(visible: boolean): void {
      const target = pick();
      attempt(() => (visible ? target?.show?.() : target?.hide?.()));
    },
    /** Registers a click handler wrapped in `safeCallback` (TMA-044); returns its removal. */
    onClick(handler: () => void): () => void {
      const target = pick();
      if (target === null) {
        return () => undefined;
      }
      const wrapped = safeCallback(handler);
      attempt(() => target.onClick?.(wrapped));
      return () => attempt(() => target.offClick?.(wrapped));
    },
  };
}

/** Telegram's BackButton (TMA-022); `TelegramButtons` owns its one handler. */
export const backButton = button(() => webApp()?.BackButton ?? null);

/** Telegram's SettingsButton (TMA-023, 7.0+). */
export const settingsButton = button(() => {
  const app = webApp();
  return app !== null && supportsFeature(app.version, "settingsButton") ? (app.SettingsButton ?? null) : null;
});
