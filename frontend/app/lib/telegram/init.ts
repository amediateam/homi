import { supportsFeature } from "./gates";
import { safeCallback, webApp } from "./sdk";
import { watchTheme } from "./theme";
import type { TgWebApp } from "./types";

/** TMA-016: fullscreen is requested on these platforms only. */
export const FULLSCREEN_PLATFORMS: readonly string[] = ["ios", "android", "android_x"];

const initialised = new WeakSet<TgWebApp>();

/** A call a client refuses degrades to nothing (TMA-042). */
function attempt(run: () => void): void {
  try {
    run();
  } catch {
    // Refused by this client: nothing to do.
  }
}

function syncFullscreen(app: TgWebApp): void {
  document.documentElement.classList.toggle("fullscreen", app.isFullscreen === true);
}

/**
 * Starts the SDK once per SDK object (TMA-014 … TMA-016, TMA-019): `ready()` and `expand()`, vertical swipes off
 * from 7.7, fullscreen on mobile from 8.0 with `html.fullscreen` following `isFullscreen`, then the theme. A late SDK is a new object, so it
 * is started again (TMA-004). Outside Telegram it does nothing.
 */
export function initTelegramApp(): void {
  const app = webApp();
  if (app === null || initialised.has(app)) {
    return;
  }
  initialised.add(app);
  attempt(() => app.ready?.());
  attempt(() => app.expand?.());
  if (supportsFeature(app.version, "verticalSwipes")) {
    attempt(() => app.disableVerticalSwipes?.());
  }
  if (supportsFeature(app.version, "fullscreen") && FULLSCREEN_PLATFORMS.includes(app.platform ?? "")) {
    attempt(() => app.requestFullscreen?.());
  }
  syncFullscreen(app);
  attempt(() => app.onEvent?.("fullscreenChanged", safeCallback(() => syncFullscreen(app))));
  watchTheme();
}
