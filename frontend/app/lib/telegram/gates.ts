/**
 * The one table of Telegram version gates (`05` TMA-042). Features without a gate — `ready`, `expand`, `close`,
 * haptics, links, BackButton, events — are not listed and work in every version. A closed gate degrades; it never
 * throws.
 */
export const GATES = {
  /** `setHeaderColor` / `setBackgroundColor` with the `bg_color` key. */
  headerColor: "6.1",
  /** `showConfirm`, else `window.confirm`. */
  confirm: "6.2",
  /** Exact hex header and background colours. */
  exactColors: "6.9",
  writeAccess: "6.9",
  requestContact: "6.9",
  settingsButton: "7.0",
  verticalSwipes: "7.7",
  /** `requestFullscreen` (on mobile only, `init.ts`). */
  fullscreen: "8.0",
  shareMessage: "8.0",
  homeScreen: "8.0",
  locationManager: "8.0",
  deviceStorage: "9.0",
} as const;

export type TelegramFeature = keyof typeof GATES;

/** `"7.10"` → `[7, 10]`; anything that is not dot-separated digits → `null`. */
export function parseVersion(version: unknown): number[] | null {
  if (typeof version !== "string" || !/^\d+(\.\d+)*$/.test(version)) {
    return null;
  }
  return version.split(".").map(Number);
}

/** Part-by-part numeric comparison; an unparsable version is below every gate. */
export function versionAtLeast(version: unknown, wanted: string): boolean {
  const have = parseVersion(version);
  const need = parseVersion(wanted);
  if (have === null || need === null) {
    return false;
  }
  for (let i = 0; i < Math.max(have.length, need.length); i++) {
    const a = have[i] ?? 0;
    const b = need[i] ?? 0;
    if (a !== b) {
      return a > b;
    }
  }
  return true;
}

export function supportsFeature(version: unknown, feature: TelegramFeature): boolean {
  return versionAtLeast(version, GATES[feature]);
}
