"use client";

import { useSyncExternalStore } from "react";

import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/telegram/theme";

const listeners = new Set<() => void>();

/**
 * Applies a theme preference — page colours, `homi-theme`, Telegram's header and background (WP-21) — and tells the
 * settings screen below, which stays mounted under the theme page and shows the preference in its row (WP-31).
 */
export function chooseTheme(preference: ThemePreference): void {
  setThemePreference(preference);
  for (const listener of [...listeners]) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The theme preference now; `auto` on the server, as the boot script decides before the first paint. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, () => "auto");
}
