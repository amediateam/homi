import { performanceClassOf } from "@/lib/graphics";

import { requestWriteAccess } from "./access";
import { requestContact } from "./contact";
import { backButton, settingsButton } from "./buttons";
import { deviceStorage } from "./deviceStorage";
import { confirm } from "./dialogs";
import { supportsFeature, versionAtLeast, type TelegramFeature } from "./gates";
import { haptic } from "./haptics";
import { homeScreen } from "./homeScreen";
import { languageCode } from "./language";
import { openLink } from "./links";
import { getLocation, locationAvailable } from "./location";
import { call } from "./phone";
import { attempt, hasInitData, initData, platform, safeCallback, version, webApp } from "./sdk";
import { shareMessage, shareText, shareUrl } from "./share";

function onVisibility(state: DocumentVisibilityState, callback: () => void): () => void {
  if (typeof document === "undefined") {
    return () => undefined;
  }
  const listener = safeCallback(() => {
    if (document.visibilityState === state) {
      callback();
    }
  });
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

/**
 * The Telegram adapter (DEC-44, `25` §3.3; the table of WP-21 "Design"): the only way components reach
 * Telegram. Outside Telegram every member is a no-op or answers `null` / `false` and never throws (TMA-043).
 * Members that do not exist on purpose (TMA-024, TMA-027, TMA-032, TMA-038): MainButton and the bottom buttons,
 * popups, alerts and QR, inline queries, stories, `sendData`, downloads, invoices, Cloud and Secure storage, biometrics
 * and motion sensors — adding one is a product change. `requestContact` (TMA-034) joined for the owner form (WP-81).
 */
export const tg = {
  initData,
  hasInitData,
  languageCode,
  platform,
  version,
  isAndroid: (): boolean => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent),
  performanceClass: (): "LOW" | "AVERAGE" | "HIGH" | null => (typeof navigator === "undefined" ? null : performanceClassOf(navigator.userAgent)),
  isVersionAtLeast: (wanted: string): boolean => versionAtLeast(version(), wanted),
  supports: (feature: TelegramFeature): boolean => supportsFeature(version(), feature),
  backButton,
  settingsButton,
  haptic,
  confirm,
  openLink,
  call,
  shareMessage,
  shareUrl,
  shareText,
  requestWriteAccess,
  requestContact,
  location: { available: locationAvailable, get: getLocation },
  homeScreen,
  deviceStorage,
  close: (): void => attempt(() => webApp()?.close?.()),
  onVisible: (callback: () => void): (() => void) => onVisibility("visible", callback),
  onHidden: (callback: () => void): (() => void) => onVisibility("hidden", callback),
};

export { initTelegramApp } from "./init";
export { detectLocale } from "./language";
export { HOME_SCREEN_TIMEOUT_MS } from "./homeScreen";
export { LINK_DEBOUNCE_MS } from "./links";
export { LOCATION_TIMEOUT_MS } from "./location";
export { TEL_DETECTION_MS } from "./phone";
export { bootState, launchUser, safeCallback, scrubLaunchFragment, TELEGRAM_SDK_URL } from "./sdk";
export { applyTheme, getThemePreference, setThemePreference, type ThemePreference } from "./theme";
export { SDK_WAIT_MS, waitForSdk, type SdkOutcome } from "./wait";
