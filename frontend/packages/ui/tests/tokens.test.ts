import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Token parity (WP-20): the values of `03` §3.6, typed here a second time, must equal the CSS of `@homi/ui`.
 * Selectors are matched by their exact text, declarations by name.
 */
const stylesDir = join(import.meta.dirname, "../src/styles");
const css = Object.fromEntries(
  readdirSync(stylesDir)
    .filter((name) => name.endsWith(".css"))
    .map((name) => [name, readFileSync(join(stylesDir, name), "utf8")]),
);
/** All stylesheets without their comments. */
const all = Object.values(css)
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(file: string, selector: string): Record<string, string> {
  const source = css[file].replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!match) {
    throw new Error(`${file}: no rule "${selector}"`);
  }
  return Object.fromEntries(
    match[1]
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const colon = part.indexOf(":");
        return [part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, " ")];
      }),
  );
}

const LIGHT_TELEGRAM = {
  "--bg": "var(--tg-theme-bg-color, #ffffff)",
  "--bg2": "var(--tg-theme-secondary-bg-color, #f2f2f7)",
  "--text": "var(--tg-theme-text-color, #0f0f10)",
  "--hint": "var(--tg-theme-hint-color, #8a8f98)",
};
const LIGHT_FIXED = { "--bg": "#ffffff", "--bg2": "#f2f2f7", "--text": "#0f0f10", "--hint": "#8a8f98" };
const DARK = {
  "--bg": "#000000",
  "--bg2": "#151517",
  "--text": "#ececee",
  "--hint": "#8f8f97",
  "--sheet": "#151517",
  "--dim": "rgba(0, 0, 0, 0.6)",
  "--sep": "color-mix(in srgb, var(--text) 14%, transparent)",
  "--fill": "color-mix(in srgb, var(--text) 8%, transparent)",
  "--badge-good": "#4ade80",
  "--badge-good-bg": "rgba(74, 222, 128, 0.13)",
  "--badge-high": "#fdba74",
  "--badge-high-bg": "rgba(251, 146, 60, 0.15)",
  "--badge-warn": "#fcd34d",
  "--badge-warn-bg": "rgba(245, 158, 11, 0.15)",
  "--badge-same": "#c2c2ca",
  "--badge-same-bg": "rgba(236, 236, 238, 0.14)",
};
const ROLES = {
  "--sheet": "var(--bg)",
  "--material": "color-mix(in srgb, var(--bg) 72%, transparent)",
  "--dim": "rgba(0, 0, 0, 0.4)",
  "--sep": "color-mix(in srgb, var(--text) 10%, transparent)",
  "--fill": "color-mix(in srgb, var(--text) 6%, transparent)",
  "--good": "#16a34a",
  "--high": "#ea7a0c",
  "--warn": "#b45309",
  "--heart": "#ff385c",
  "--badge-good": "#15803d",
  "--badge-good-bg": "rgba(22, 163, 74, 0.11)",
  "--badge-high": "#c2410c",
  "--badge-high-bg": "rgba(234, 122, 12, 0.12)",
  "--badge-warn": "#92400e",
  "--badge-warn-bg": "rgba(180, 83, 9, 0.12)",
  "--badge-same": "var(--hint)",
  "--badge-same-bg": "var(--fill)",
  "--danger": "#ff5c5c",
  "--r-s": "12px",
  "--r-m": "16px",
  "--r-l": "24px",
  "--r-photo": "18px",
  "--tabbar-h": "62px",
  "--bottom-chrome": "calc(var(--tabbar-h) + var(--bottom-inset) + 90px)",
  "--glass": "blur(22px) saturate(190%)",
};
const INSETS = {
  "--top-inset": "calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))",
  "--bottom-inset": "var(--tg-safe-area-inset-bottom, 0px)",
};
const LADDER = {
  "--z-map-note": "5",
  "--z-topbar": "10",
  "--z-cta": "20",
  "--z-view-toggle": "29",
  "--z-tabbar": "30",
  "--z-map-card": "31",
  "--z-nudge": "35",
  "--z-subpage": "40",
  "--z-listing": "45",
  "--z-owner": "46",
  "--z-owner-bar": "47",
  "--z-backdrop": "50",
  "--z-toast": "60",
  "--z-viewer": "100",
  "--z-pin": "1000",
};

describe("tokens of 03 §3.6", () => {
  it("colour roles, radii, tab bar and glass", () => {
    expect(declarations("tokens.css", ":root")).toMatchObject(ROLES);
  });

  it("the brand accent, the same in every theme", () => {
    expect(declarations("brand.css", ":root")).toEqual({ "--accent": "#ffd23f", "--accent-text": "#0b0b0b" });
    expect(all.match(/--accent:/g)).toHaveLength(1);
  });

  it("auto with Telegram light reads Telegram's four colours with the light fallbacks", () => {
    expect(declarations("themes.css", 'html[data-scheme="light"]:not([data-theme])')).toMatchObject(LIGHT_TELEGRAM);
  });

  it("explicit light is the fixed light palette", () => {
    expect(declarations("themes.css", 'html[data-theme="light"]')).toMatchObject(LIGHT_FIXED);
  });

  it("dark is the fixed dark palette, whatever data-theme says", () => {
    expect(declarations("themes.css", 'html[data-scheme="dark"]')).toMatchObject(DARK);
  });

  it("safe areas only from Telegram's variables", () => {
    expect(declarations("layout.css", ":root")).toMatchObject(INSETS);
  });

  it("the z-index ladder and motion as named tokens", () => {
    expect(declarations("theme.css", ":root")).toMatchObject({
      ...LADDER,
      "--ease-out": "cubic-bezier(0.2, 0.9, 0.3, 1)",
      "--ease-ios": "var(--ease-out)",
      "--ease-spring": "cubic-bezier(0.3, 1.2, 0.45, 1)",
      "--ease-pop": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      "--dur-fast": "0.25s",
      "--dur-base": "0.3s",
      "--dur-slow": "0.35s",
    });
  });

  it("the shell's aliases point at legacy levels: mini title 31, overlay slot 45 (WP-23)", () => {
    expect(declarations("theme.css", ":root")).toMatchObject({
      "--z-mini-title": "var(--z-map-card)",
      "--z-overlay": "var(--z-listing)",
    });
  });
});

describe("rules of the stylesheet", () => {
  it("uses no prefers-color-scheme, env(safe-area), dvh, svh or Telegram viewport variables", () => {
    expect(all).not.toMatch(/prefers-color-scheme/);
    expect(all).not.toMatch(/env\(\s*safe-area/);
    expect(all).not.toMatch(/\d(dvh|svh|lvh)\b/);
    expect(all).not.toMatch(/--tg-viewport/);
  });

  it("removes blur and animation under html.lite and stops shimmer and spinner on reduced motion", () => {
    expect(declarations("lite.css", "html.lite .glass")).toMatchObject({
      "backdrop-filter": "none",
      "-webkit-backdrop-filter": "none",
    });
    expect(css["motion.css"]).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css["motion.css"]).toMatch(/transition: none !important/);
  });

  it("skips every full card off screen under html.lite with the pinned release's 360 px estimate", () => {
    expect(declarations("lite.css", "html.lite [data-card]")).toEqual({
      "content-visibility": "auto",
      "contain-intrinsic-size": "auto 360px",
    });
  });

  it("stops every keyframe animation on reduced motion, the entrances of sheets, dialogs, toasts and sub-pages too", () => {
    const motion = css["motion.css"].replace(/\/\*[\s\S]*?\*\//g, "");
    const reduced = motion.slice(motion.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/(?:^|\n)\s*\*,\s*::before,\s*::after\s*\{\s*animation: none !important;\s*\}/);
  });

  it("animates the radar art with legacy's two keyframes, stopped under lite and on reduced motion (WP-30)", () => {
    const motion = css["motion.css"].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(motion).toMatch(/@keyframes radar-turn\s*\{\s*to\s*\{\s*transform: rotate\(360deg\);\s*\}\s*\}/);
    expect(motion).toMatch(
      /@keyframes radar-blip\s*\{\s*0%,\s*8%\s*\{\s*opacity: 1;\s*transform: scale\(1\);\s*\}\s*60%,\s*100%\s*\{\s*opacity: 0\.15;\s*transform: scale\(0\.8\);\s*\}\s*\}/,
    );
    const theme = css["theme.css"].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(theme).toMatch(/--animate-radar-turn: radar-turn 3\.2s linear infinite;/);
    expect(theme).toMatch(/--animate-radar-blip: radar-blip 3\.2s ease-out infinite;/);
    expect(declarations("lite.css", "html.lite [data-radar-animation]")).toEqual({ animation: "none" });
    // Reduced motion needs no rule of its own: the global one stops every keyframe animation (the test above).
  });

  it("moves the listing layer as legacy: in from 24 % over 0.25 s, out over 0.2 s ease-in and held; none under lite (WP-36)", () => {
    const motion = css["motion.css"].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(motion).toMatch(/@keyframes listing-in\s*\{\s*from\s*\{\s*opacity: 0;\s*transform: translateX\(24%\);\s*\}\s*\}/);
    // The leave moves the insets: a transform would make the scrolling layer the containing block of its fixed bar.
    expect(motion).toMatch(/@keyframes listing-out\s*\{\s*to\s*\{\s*opacity: 0;\s*left: 24%;\s*right: -24%;\s*\}\s*\}/);
    const theme = css["theme.css"].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(theme).toMatch(/--animate-listing-in: listing-in var\(--dur-fast\) var\(--ease-ios\);/);
    expect(theme).toMatch(/--animate-listing-out: listing-out 0\.2s ease-in forwards;/);
    expect(declarations("lite.css", "html.lite [data-layer-motion]")).toEqual({ animation: "none" });
  });

  it("locks the page under a sheet, a full sheet and a sub-page (WP-36: subpage-open)", () => {
    const layout = css["layout.css"].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(layout).toMatch(/body\.sheet-open,\s*body\.locked,\s*body\.subpage-open\s*\{\s*overflow: hidden;\s*overscroll-behavior: none;\s*\}/);
  });

  it("declares the hooks WP-23 fills", () => {
    expect(css["layout.css"]).toMatch(/html\.fullscreen\s*\{/);
    expect(css["layout.css"]).toMatch(/html\.chrome-mini\s*\{/);
  });

  it("removes Tailwind's default palette so only the roles exist", () => {
    expect(css["theme.css"]).toMatch(/--color-\*: initial;/);
  });
});
