import { storageGet, storageSet } from "@/lib/storage";

import { supportsFeature } from "./gates";
import { hasInitData, safeCallback, webApp } from "./sdk";
import type { TgWebApp } from "./types";

/**
 * Theme (TMA-019 … TMA-021, `03` §3.6). The preference `homi-theme` is `auto`, `light` or `dark`; `me.theme`
 * replaces it on every start (the session bootstrap calls `setThemePreference`). `data-scheme` is always set,
 * `data-theme` only for an explicit choice; `themes.css` of `@homi/ui` does the rest. The boot script applies the
 * stored preference before paint; this module takes over once the SDK is there.
 */

export type ThemePreference = "auto" | "light" | "dark";

export function getThemePreference(): ThemePreference {
  const stored = storageGet("homi-theme");
  return stored === "light" || stored === "dark" ? stored : "auto";
}

function attempt(run: () => void): void {
  try {
    run();
  } catch {
    // A refused colour call leaves Telegram's own colour.
  }
}

/** The exact `--bg` from 6.9, else Telegram's `bg_color` key (TMA-020). */
function windowColour(app: TgWebApp): string {
  if (!supportsFeature(app.version, "exactColors")) {
    return "bg_color";
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  return /^#[0-9a-f]{6}$/i.test(bg) ? bg : "bg_color";
}

export function applyTheme(): void {
  const preference = getThemePreference();
  const app = webApp();
  const inside = app !== null && hasInitData();
  const scheme = preference === "auto" ? (inside && app.colorScheme === "dark" ? "dark" : "light") : preference;
  const html = document.documentElement;
  html.dataset.scheme = scheme;
  if (preference === "auto") {
    html.removeAttribute("data-theme");
  } else {
    html.dataset.theme = preference;
  }
  if (!inside || !supportsFeature(app.version, "headerColor")) {
    return;
  }
  // Auto + light keeps Telegram's own light colours (TMA-020).
  const colour = preference === "auto" && scheme === "light" ? "bg_color" : windowColour(app);
  attempt(() => app.setHeaderColor?.(colour));
  attempt(() => app.setBackgroundColor?.(colour));
}

export function setThemePreference(preference: ThemePreference): void {
  storageSet("homi-theme", preference);
  applyTheme();
}

const watched = new WeakSet<TgWebApp>();

/** Applies the theme and follows `themeChanged` in auto; registered once per SDK object. */
export function watchTheme(): void {
  applyTheme();
  const app = webApp();
  if (app === null || watched.has(app)) {
    return;
  }
  watched.add(app);
  attempt(() =>
    app.onEvent?.(
      "themeChanged",
      safeCallback(() => {
        if (getThemePreference() === "auto") {
          applyTheme();
        }
      }),
    ),
  );
}
