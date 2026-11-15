import { useSyncExternalStore } from "react";

import { attempt, insideTelegram, platform, safeCallback, sdkGeneration, subscribeSdk, version, webApp } from "./sdk";

export interface TelegramState {
  inside: boolean;
  platform: string;
  version: string;
  isFullscreen: boolean;
  colorScheme: "light" | "dark";
}

const outside: TelegramState = { inside: false, platform: "unknown", version: "", isFullscreen: false, colorScheme: "light" };
let cached: TelegramState = outside;

function read(): TelegramState {
  const app = webApp();
  const next: TelegramState = {
    inside: insideTelegram() !== null,
    platform: platform(),
    version: version(),
    isFullscreen: app?.isFullscreen === true,
    colorScheme: app?.colorScheme === "dark" ? "dark" : "light",
  };
  if (Object.keys(next).some((key) => next[key as keyof TelegramState] !== cached[key as keyof TelegramState])) {
    cached = next;
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const app = webApp();
  if (app === null) {
    return () => undefined;
  }
  const listener = safeCallback(onChange);
  attempt(() => app.onEvent?.("fullscreenChanged", listener));
  attempt(() => app.onEvent?.("themeChanged", listener));
  return () => {
    attempt(() => app.offEvent?.("fullscreenChanged", listener));
    attempt(() => app.offEvent?.("themeChanged", listener));
  };
}

/** The Telegram state a component renders from (TMA-016, TMA-019): fullscreen, colour scheme, platform, version. */
export function useTelegram(): TelegramState {
  return useSyncExternalStore(subscribe, read, () => outside);
}

/** Re-renders when a new SDK object was started (a late SDK); effects that register handlers depend on it. */
export function useSdkGeneration(): number {
  return useSyncExternalStore(subscribeSdk, sdkGeneration, () => 0);
}
