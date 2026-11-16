/**
 * The device rule of lite graphics (`03` §1.7, TMA-041) without React or storage, so a Server Component can ask it
 * of a request's User-Agent (the feed's `serverSmallOnly`, WP-24). `lib/graphics.ts` re-exports it; the boot script
 * repeats it in ES5 (`boot/boot.js`), and a unit test compares both.
 */

export interface DeviceProfile {
  userAgent: string;
  /** `navigator.hardwareConcurrency`. */
  cores?: number;
  /** `navigator.deviceMemory`, in GB. */
  memory?: number;
}

export const GRAPHICS_RULES = {
  lowEndCores: 4,
  lowEndMemoryGb: 3,
  /** A missing core or memory value counts as this. */
  missingValue: 8,
  frameIntervals: 150,
  slowFrameMs: 28,
  slowShare: 0.2,
} as const;

/** `Telegram-Android/<version> (<device>; <os>; <sdk>; LOW|AVERAGE|HIGH)` (TMA-041). */
const TELEGRAM_ANDROID_CLASS = /Telegram-Android\/[^(]*\([^)]*;\s*(LOW|AVERAGE|HIGH)\s*\)/;

/** The class Telegram for Android writes into its User-Agent, or `null` (TMA-041). */
export function performanceClassOf(userAgent: string): "LOW" | "AVERAGE" | "HIGH" | null {
  return (TELEGRAM_ANDROID_CLASS.exec(userAgent)?.[1] as "LOW" | "AVERAGE" | "HIGH" | undefined) ?? null;
}

/** The browser's own profile. A Server Component passes the request's User-Agent instead. */
export function currentProfile(): DeviceProfile {
  if (typeof navigator === "undefined") {
    return { userAgent: "" };
  }
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency || undefined, memory };
}

export function isAndroid(profile: DeviceProfile): boolean {
  return /Android/i.test(profile.userAgent);
}

/** The Telegram-Android class decides when present; else Android with few cores or little memory. iOS and desktop never. */
export function isLowEndDevice(profile: DeviceProfile = currentProfile()): boolean {
  const telegramClass = performanceClassOf(profile.userAgent);
  if (telegramClass !== null) {
    return telegramClass !== "HIGH";
  }
  if (!isAndroid(profile)) {
    return false;
  }
  const cores = profile.cores ?? GRAPHICS_RULES.missingValue;
  const memory = profile.memory ?? GRAPHICS_RULES.missingValue;
  return cores <= GRAPHICS_RULES.lowEndCores || memory <= GRAPHICS_RULES.lowEndMemoryGb;
}
