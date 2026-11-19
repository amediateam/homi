import type { MapScheme } from "./types";

/**
 * The basemap colours per scheme (WP-27; DEC-46 lets them differ slightly from legacy). MapLibre cannot read CSS
 * variables, so the values are literal: background, land, labels, halo and the mask dimming are the tokens of
 * `@homi/ui` (`themes.css`, `tokens.css`: `--bg`, `--bg2`, `--text`, `--hint`, `--dim`, `--accent`); water, green,
 * roads, buildings, boundaries and the "me" blue have no token and are designed here. `html[data-scheme]` picks the
 * scheme; Telegram's theme colours are not followed on the map.
 */
export type Palette = {
  /** The background layer: the whole map while `tiles` is absent, under the raster and the vector earth. */
  background: string;
  land: string;
  water: string;
  green: string;
  roads: { highway: string; major: string; minor: string; path: string; rail: string; casing: string };
  buildings: string;
  boundaries: string;
  /** Place labels. */
  label: string;
  /** Road and neighbourhood labels. */
  labelMuted: string;
  labelHalo: string;
  /** The dimmed world outside a polygon of the filters, and the polygon's outline (`mask.ts`). */
  mask: { fill: string; outline: string };
  /** The "where am I" dot, its ring and the accuracy circle (LocateButton). */
  me: { dot: string; ring: string; accuracy: string; accuracyOutline: string };
  /** The OSM raster's paint: unchanged in light, inverted and dimmed in dark (hue kept by a half turn). */
  raster: { brightnessMin: number; brightnessMax: number; saturation: number; contrast: number; hueRotate: number };
};

const LIGHT: Palette = {
  background: "#f2f2f7",
  land: "#f2f2f7",
  water: "#c6dbef",
  green: "#d9ead3",
  roads: {
    highway: "#ffe38f",
    major: "#ffffff",
    minor: "#ffffff",
    path: "#e3e3e9",
    rail: "#c8c8d0",
    casing: "#d9d9e0",
  },
  buildings: "#e4e4ea",
  boundaries: "#8a8f98",
  label: "#0f0f10",
  labelMuted: "#8a8f98",
  labelHalo: "#ffffff",
  mask: { fill: "rgba(0, 0, 0, 0.4)", outline: "#0f0f10" },
  me: {
    dot: "#007aff",
    ring: "#ffffff",
    accuracy: "rgba(0, 122, 255, 0.14)",
    accuracyOutline: "rgba(0, 122, 255, 0.4)",
  },
  raster: { brightnessMin: 0, brightnessMax: 1, saturation: 0, contrast: 0, hueRotate: 0 },
};

const DARK: Palette = {
  background: "#151517",
  land: "#151517",
  water: "#0f2234",
  green: "#152519",
  roads: {
    highway: "#5c4b17",
    major: "#303035",
    minor: "#27272c",
    path: "#212125",
    rail: "#38383e",
    casing: "#0b0b0c",
  },
  buildings: "#222226",
  boundaries: "#8f8f97",
  label: "#ececee",
  labelMuted: "#8f8f97",
  labelHalo: "#000000",
  mask: { fill: "rgba(0, 0, 0, 0.6)", outline: "#ececee" },
  me: {
    dot: "#0a84ff",
    ring: "#ffffff",
    accuracy: "rgba(10, 132, 255, 0.18)",
    accuracyOutline: "rgba(10, 132, 255, 0.5)",
  },
  raster: { brightnessMin: 0.9, brightnessMax: 0.08, saturation: -0.3, contrast: 0, hueRotate: 180 },
};

export function paletteOf(scheme: MapScheme): Palette {
  return scheme === "dark" ? DARK : LIGHT;
}
