/**
 * The narrow part of `window.Telegram.WebApp` that HOMI uses (`05` TMA-004 … TMA-044), declared by hand: there is
 * no types package (WP-21). Every member is optional, because a client below a gate may lack it, and the SDK is
 * whatever telegram.org serves (TMA-001).
 */

type Callback<T extends unknown[] = []> = (...args: T) => void;

export interface TgButton {
  isVisible?: boolean;
  show?(): unknown;
  hide?(): unknown;
  onClick?(callback: Callback): unknown;
  offClick?(callback: Callback): unknown;
}

export interface TgUser {
  id?: number;
  language_code?: string;
}

export interface TgLocation {
  latitude: number;
  longitude: number;
  horizontal_accuracy?: number | null;
}

export type TgHomeScreenStatus = "unsupported" | "unknown" | "added" | "missed";

export interface TgWebApp {
  version?: string;
  platform?: string;
  initData?: string;
  initDataUnsafe?: { user?: TgUser; start_param?: string };
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string | undefined>;
  isFullscreen?: boolean;
  isVersionAtLeast?(version: string): boolean;
  ready?(): void;
  expand?(): void;
  close?(): void;
  onEvent?(eventType: string, callback: Callback<[unknown?]>): void;
  offEvent?(eventType: string, callback: Callback<[unknown?]>): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  requestFullscreen?(): void;
  showConfirm?(message: string, callback?: Callback<[boolean]>): void;
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink?(url: string): void;
  shareMessage?(messageId: string, callback?: Callback<[boolean]>): void;
  requestWriteAccess?(callback?: Callback<[boolean]>): void;
  /** Bot API 6.9: the native prompt for the user's phone; the second argument (the contact) is never read here. */
  requestContact?(callback?: Callback<[boolean, unknown?]>): void;
  checkHomeScreenStatus?(callback?: Callback<[TgHomeScreenStatus]>): void;
  addToHomeScreen?(): void;
  BackButton?: TgButton;
  SettingsButton?: TgButton;
  HapticFeedback?: {
    impactOccurred?(style: "light" | "medium" | "heavy" | "rigid" | "soft"): unknown;
    notificationOccurred?(type: "error" | "success" | "warning"): unknown;
  };
  LocationManager?: {
    isInited?: boolean;
    isLocationAvailable?: boolean;
    isAccessRequested?: boolean;
    isAccessGranted?: boolean;
    init?(callback?: Callback): unknown;
    getLocation?(callback: Callback<[TgLocation | null]>): unknown;
  };
  DeviceStorage?: {
    getItem?(key: string, callback: Callback<[unknown, (string | null)?]>): unknown;
    setItem?(key: string, value: string, callback?: Callback<[unknown, boolean?]>): unknown;
    removeItem?(key: string, callback?: Callback<[unknown, boolean?]>): unknown;
  };
}

/** `window.__homiBoot` of the inline boot script (`boot/boot.js`, TMA-003). */
export interface HomiBoot {
  ok: boolean;
  watching: boolean;
  /** `ok` once the SDK tag loaded, `error` when it failed, `null` while pending. */
  sdk: "ok" | "error" | null;
  show?: () => void;
  errors: unknown[];
}

/** The globals this layer reads; only `lib/telegram/sdk.ts` touches them. */
export interface TelegramHost {
  /** `WebView.receiveEvent` is the SDK's own event entry point, used once by the share recovery (TMA-030). */
  Telegram?: { WebApp?: TgWebApp; WebView?: { receiveEvent?(eventType: string, eventData?: unknown): void } };
  __homiBoot?: HomiBoot;
  TelegramWebviewProxy?: { postEvent?(eventType: string, eventData?: string): void };
  external?: { notify?(message: string): void };
}
