import { syntheticInitData } from "./initData";

export type TelegramPlatform = "ios" | "android" | "android_x" | "tdesktop" | "macos" | "weba" | "webk" | "unknown";
export type TelegramColorScheme = "light" | "dark";
export type HomeScreenStatus = "unsupported" | "unknown" | "added" | "missed";
export type HapticImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
export type HapticNotificationType = "error" | "success" | "warning";

export interface FakeLocation {
  latitude: number;
  longitude: number;
  horizontal_accuracy?: number;
}

/** What the simulated user answers. Tests may change `fake.answers` between two actions. */
export interface FakeTelegramAnswers {
  /** `showConfirm` result. */
  confirm: boolean;
  /** `requestWriteAccess` result (TMA-033). */
  writeAccess: boolean;
  /**
   * `shareMessage` result (TMA-030). `"stuck"` never answers and keeps the share window open, as a real client
   * does after a lost callback: the next `shareMessage` throws `WebAppShareMessageOpened` until the SDK's
   * `prepared_message_failed` event closes it.
   */
  shareSent: boolean | "stuck";
  /** `checkHomeScreenStatus` result (TMA-036). */
  homeScreenStatus: HomeScreenStatus;
  /** `LocationManager.getLocation` result; `null` = access denied (TMA-035). */
  location: FakeLocation | null;
}

export interface FakeTelegramOptions {
  /** Telegram WebApp version of the simulated client; default `9.0`. Members above it throw (TMA-042). */
  version?: string;
  platform?: TelegramPlatform;
  /** A complete `initData` string; default: `syntheticInitData()`. */
  initData?: string;
  /** `start_param` of the generated `initData`; cannot be combined with `initData`. */
  startParam?: string;
  colorScheme?: TelegramColorScheme;
  themeParams?: Record<string, string>;
  viewport?: { height?: number; stableHeight?: number; isExpanded?: boolean };
  /** Safe-area insets in px (8.0+); the double writes them as `--tg-safe-area-inset-*` like the real client. */
  safeArea?: Partial<FakeInsets>;
  contentSafeArea?: Partial<FakeInsets>;
  answers?: Partial<FakeTelegramAnswers>;
}

export interface FakeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Plain, serialisable configuration of the double: what `installFakeTelegram` receives, also inside a page. */
export interface FakeTelegramConfig {
  version: string;
  platform: TelegramPlatform;
  initData: string;
  colorScheme: TelegramColorScheme;
  themeParams: Record<string, string>;
  viewport: { height: number; stableHeight: number; isExpanded: boolean };
  safeArea: FakeInsets;
  contentSafeArea: FakeInsets;
  /** Both palettes, so that `setColorScheme` can switch inside a page. */
  palettes: Record<TelegramColorScheme, Record<string, string>>;
  answers: FakeTelegramAnswers;
}

export interface FakeTelegramCall {
  member: string;
  args: unknown[];
}

type Callback<T extends unknown[] = []> = (...args: T) => void;

export interface FakeBottomButton {
  readonly isVisible: boolean;
  show(): FakeBottomButton;
  hide(): FakeBottomButton;
  onClick(callback: Callback): FakeBottomButton;
  offClick(callback: Callback): FakeBottomButton;
}

export interface FakeInitDataUnsafe {
  query_id?: string;
  user?: { id: number; first_name: string; last_name?: string; username?: string; language_code?: string };
  auth_date?: number;
  start_param?: string;
  hash?: string;
  [field: string]: unknown;
}

/** The `window.Telegram.WebApp` members HOMI uses (`05` TMA-004 … TMA-044). */
export interface FakeWebApp {
  readonly version: string;
  readonly platform: TelegramPlatform;
  readonly initData: string;
  readonly initDataUnsafe: FakeInitDataUnsafe;
  readonly colorScheme: TelegramColorScheme;
  readonly themeParams: Record<string, string>;
  readonly isExpanded: boolean;
  readonly viewportHeight: number;
  readonly viewportStableHeight: number;
  readonly isFullscreen: boolean;
  readonly isVerticalSwipesEnabled: boolean;
  readonly safeAreaInset: FakeInsets;
  readonly contentSafeAreaInset: FakeInsets;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  onEvent(eventType: string, callback: Callback<[unknown?]>): void;
  offEvent(eventType: string, callback: Callback<[unknown?]>): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  disableVerticalSwipes(): void;
  enableVerticalSwipes(): void;
  requestFullscreen(): void;
  exitFullscreen(): void;
  showConfirm(message: string, callback?: Callback<[boolean]>): void;
  showAlert(message: string, callback?: Callback): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  shareMessage(messageId: string, callback?: Callback<[boolean]>): void;
  requestWriteAccess(callback?: Callback<[boolean]>): void;
  checkHomeScreenStatus(callback?: Callback<[HomeScreenStatus]>): void;
  addToHomeScreen(): void;
  readonly BackButton: FakeBottomButton;
  readonly SettingsButton: FakeBottomButton;
  readonly HapticFeedback: {
    impactOccurred(style: HapticImpactStyle): unknown;
    notificationOccurred(type: HapticNotificationType): unknown;
    selectionChanged(): unknown;
  };
  readonly LocationManager: {
    readonly isInited: boolean;
    readonly isLocationAvailable: boolean;
    readonly isAccessRequested: boolean;
    readonly isAccessGranted: boolean;
    init(callback?: Callback): unknown;
    getLocation(callback: Callback<[FakeLocation | null]>): unknown;
    openSettings(): unknown;
  };
  readonly DeviceStorage: {
    setItem(key: string, value: string, callback?: Callback<[string | null, boolean?]>): unknown;
    getItem(key: string, callback: Callback<[string | null, (string | null)?]>): unknown;
    removeItem(key: string, callback?: Callback<[string | null, boolean?]>): unknown;
    clear(callback?: Callback<[string | null, boolean?]>): unknown;
  };
}

export interface FakeTelegram {
  readonly webApp: FakeWebApp;
  /** Every call the code under test made, in order, refused ones included (`isVersionAtLeast` is not recorded). */
  readonly calls: FakeTelegramCall[];
  readonly answers: FakeTelegramAnswers;
  /** Whether `close()` was called. */
  readonly closed: boolean;
  /** Fires a client event, e.g. `backButtonClicked`, `settingsButtonClicked`, `themeChanged`, `homeScreenAdded`. */
  emit(eventType: string, payload?: unknown): void;
  /** The user switches Telegram's theme: `colorScheme` and `themeParams` change, then `themeChanged` fires. */
  setColorScheme(scheme: TelegramColorScheme): void;
  /** New safe-area insets (8.0+): the CSS variables change, then `safeAreaChanged` fires. */
  setSafeArea(insets: Partial<FakeInsets>): void;
  /** A new viewport: `--tg-viewport-*` change, then `viewportChanged` fires. */
  setViewport(viewport: { height?: number; stableHeight?: number }): void;
  /** Removes `window.Telegram` again. */
  uninstall(): void;
}

/**
 * The globals the double sets. Deliberately not a `declare global` augmentation: e2e specs are part of the apps'
 * type check, and the double's types must not leak into the apps' `Window`.
 */
export interface FakeTelegramWindow {
  /** `WebView.receiveEvent` is the SDK's own event entry point (the share recovery of WP-21 uses it). */
  Telegram?: { WebApp: FakeWebApp; WebView?: { receiveEvent(eventType: string, eventData?: unknown): void } };
  __homiFakeTelegram?: FakeTelegram;
}

const themes: Record<TelegramColorScheme, Record<string, string>> = {
  light: {
    bg_color: "#ffffff",
    secondary_bg_color: "#efeff4",
    text_color: "#000000",
    hint_color: "#999999",
    link_color: "#2481cc",
    button_color: "#2481cc",
    button_text_color: "#ffffff",
  },
  dark: {
    bg_color: "#212121",
    secondary_bg_color: "#181818",
    text_color: "#ffffff",
    hint_color: "#aaaaaa",
    link_color: "#8774e1",
    button_color: "#8774e1",
    button_text_color: "#ffffff",
  },
};

/** Fills the defaults of the double; the result is plain data that can cross into a page. */
export function resolveFakeTelegramConfig(options: FakeTelegramOptions = {}): FakeTelegramConfig {
  if (options.initData !== undefined && options.startParam !== undefined) {
    throw new Error("fakeTelegram: pass either initData or startParam; startParam is part of initData");
  }
  const version = options.version ?? "9.0";
  if (!/^\d+\.\d+$/.test(version)) {
    throw new Error(`fakeTelegram: version must look like "8.0", got "${version}"`);
  }
  const colorScheme = options.colorScheme ?? "light";
  const insets = (partial: Partial<FakeInsets> = {}): FakeInsets => ({ top: 0, bottom: 0, left: 0, right: 0, ...partial });
  return {
    version,
    platform: options.platform ?? "ios",
    initData: options.initData ?? syntheticInitData({}, { startParam: options.startParam }),
    colorScheme,
    themeParams: { ...themes[colorScheme], ...options.themeParams },
    viewport: {
      height: options.viewport?.height ?? 844,
      stableHeight: options.viewport?.stableHeight ?? options.viewport?.height ?? 844,
      isExpanded: options.viewport?.isExpanded ?? false,
    },
    safeArea: insets(options.safeArea),
    contentSafeArea: insets(options.contentSafeArea),
    palettes: themes,
    answers: {
      confirm: true,
      writeAccess: true,
      shareSent: true,
      homeScreenStatus: "missed",
      location: null,
      ...options.answers,
    },
  };
}

/** Installs a `window.Telegram.WebApp` double in this window (jsdom in Vitest). */
export function fakeTelegram(options: FakeTelegramOptions = {}): FakeTelegram {
  return installFakeTelegram(resolveFakeTelegramConfig(options));
}

/**
 * The double itself. It must stay self-contained — no imports, no references outside its body — because
 * `playwrightTelegram` passes it to `page.addInitScript`, which sends its source text into the page.
 *
 * Version gates are those of TMA-042: a member the configured version does not support throws
 * `WebAppMethodUnsupported` (the real client throws for most of them and only warns for some; the double always
 * throws, so a missing gate in app code fails a test). Members without a gate in TMA-042 (`ready`, `expand`,
 * `close`, `BackButton`, `HapticFeedback`, links, events) work in every version. Callbacks arrive asynchronously,
 * as from a real client.
 */
export function installFakeTelegram(config: FakeTelegramConfig): FakeTelegram {
  const host = window as unknown as FakeTelegramWindow;
  const gates: Record<string, string> = {
    setHeaderColor: "6.1",
    setBackgroundColor: "6.1",
    showConfirm: "6.2",
    showAlert: "6.2",
    requestWriteAccess: "6.9",
    SettingsButton: "7.0",
    disableVerticalSwipes: "7.7",
    enableVerticalSwipes: "7.7",
    requestFullscreen: "8.0",
    exitFullscreen: "8.0",
    shareMessage: "8.0",
    checkHomeScreenStatus: "8.0",
    addToHomeScreen: "8.0",
    safeArea: "8.0",
    LocationManager: "8.0",
    DeviceStorage: "9.0",
  };
  const versionAtLeast = (wanted: string): boolean => {
    const have = config.version.split(".").map(Number);
    const need = wanted.split(".").map(Number);
    for (let i = 0; i < Math.max(have.length, need.length); i++) {
      const a = have[i] ?? 0;
      const b = need[i] ?? 0;
      if (a !== b) {
        return a > b;
      }
    }
    return true;
  };
  const unsupported = (member: string, since: string): Error =>
    new Error(`WebAppMethodUnsupported: ${member} needs Telegram ${since}, the client is ${config.version}`);

  const calls: FakeTelegramCall[] = [];
  const answers: FakeTelegramAnswers = { ...config.answers };
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const storage = new Map<string, string>();
  const later = (run: () => void): void => {
    queueMicrotask(run);
  };
  const state = {
    colorScheme: config.colorScheme,
    themeParams: { ...config.themeParams },
    viewport: { height: config.viewport.height, stableHeight: config.viewport.stableHeight },
    safeArea: { ...config.safeArea },
    contentSafeArea: { ...config.contentSafeArea },
    share: null as null | { callback?: (sent: boolean) => void },
    closed: false,
    isExpanded: config.viewport.isExpanded,
    isFullscreen: false,
    isVerticalSwipesEnabled: true,
    backVisible: false,
    settingsVisible: false,
    location: { isInited: false, isAccessRequested: false, isAccessGranted: false },
  };

  /** The CSS variables a real client writes on `<html>` (`--tg-viewport-*` always, safe areas from 8.0). */
  const cssVariables: string[] = [];
  function writeCss(): void {
    const style = document.documentElement.style;
    const set = (name: string, px: number): void => {
      style.setProperty(name, `${px}px`);
      if (!cssVariables.includes(name)) {
        cssVariables.push(name);
      }
    };
    set("--tg-viewport-height", state.viewport.height);
    set("--tg-viewport-stable-height", state.viewport.stableHeight);
    if (versionAtLeast(gates.safeArea)) {
      for (const side of ["top", "bottom", "left", "right"] as const) {
        set(`--tg-safe-area-inset-${side}`, state.safeArea[side]);
        set(`--tg-content-safe-area-inset-${side}`, state.contentSafeArea[side]);
      }
    }
  }

  function record<T>(member: string, args: unknown[], run: () => T): T {
    calls.push({ member, args });
    const since = gates[member] ?? gates[member.split(".")[0]];
    if (since !== undefined && !versionAtLeast(since)) {
      throw unsupported(member, since);
    }
    return run();
  }

  function emit(eventType: string, payload?: unknown): void {
    for (const listener of [...(listeners.get(eventType) ?? [])]) {
      listener.call(webApp, payload);
    }
  }

  function on(eventType: string, callback: (payload?: unknown) => void): void {
    const set = listeners.get(eventType) ?? new Set();
    set.add(callback);
    listeners.set(eventType, set);
  }

  function off(eventType: string, callback: (payload?: unknown) => void): void {
    listeners.get(eventType)?.delete(callback);
  }

  function checkColor(member: string, color: string): void {
    if (color === "bg_color" || color === "secondary_bg_color") {
      return;
    }
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error(`WebAppColorInvalid: ${member}(${color})`);
    }
    if (!versionAtLeast("6.9")) {
      throw unsupported(`${member} with a hex colour`, "6.9");
    }
  }

  function checkUrl(url: string, telegramOnly: boolean): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`WebAppTgUrlInvalid: ${url}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`WebAppTgUrlInvalid: ${url}`);
    }
    if (telegramOnly && parsed.hostname !== "t.me") {
      throw new Error(`WebAppTgUrlInvalid: ${url}`);
    }
  }

  function bottomButton(name: "BackButton" | "SettingsButton", eventType: string, visible: "backVisible" | "settingsVisible"): FakeBottomButton {
    const button: FakeBottomButton = {
      get isVisible() {
        return state[visible];
      },
      show: () =>
        record(`${name}.show`, [], () => {
          state[visible] = true;
          return button;
        }),
      hide: () =>
        record(`${name}.hide`, [], () => {
          state[visible] = false;
          return button;
        }),
      onClick: (callback) =>
        record(`${name}.onClick`, [callback], () => {
          on(eventType, callback);
          return button;
        }),
      offClick: (callback) =>
        record(`${name}.offClick`, [callback], () => {
          off(eventType, callback);
          return button;
        }),
    };
    return button;
  }

  const initDataUnsafe: FakeInitDataUnsafe = {};
  for (const [key, value] of new URLSearchParams(config.initData)) {
    if (key === "user" || key === "receiver" || key === "chat") {
      initDataUnsafe[key] = JSON.parse(value);
    } else if (key === "auth_date") {
      initDataUnsafe[key] = Number(value);
    } else {
      initDataUnsafe[key] = value;
    }
  }

  const impactStyles = ["light", "medium", "heavy", "rigid", "soft"];
  const notificationTypes = ["error", "success", "warning"];

  const HapticFeedback: FakeWebApp["HapticFeedback"] = {
    impactOccurred: (style) =>
      record("HapticFeedback.impactOccurred", [style], () => {
        if (!impactStyles.includes(style)) {
          throw new Error(`WebAppHapticImpactStyleInvalid: ${style}`);
        }
        return HapticFeedback;
      }),
    notificationOccurred: (type) =>
      record("HapticFeedback.notificationOccurred", [type], () => {
        if (!notificationTypes.includes(type)) {
          throw new Error(`WebAppHapticNotificationTypeInvalid: ${type}`);
        }
        return HapticFeedback;
      }),
    selectionChanged: () => record("HapticFeedback.selectionChanged", [], () => HapticFeedback),
  };

  const LocationManager: FakeWebApp["LocationManager"] = {
    get isInited() {
      return state.location.isInited;
    },
    isLocationAvailable: true,
    get isAccessRequested() {
      return state.location.isAccessRequested;
    },
    get isAccessGranted() {
      return state.location.isAccessGranted;
    },
    init: (callback) =>
      record("LocationManager.init", callback ? [callback] : [], () => {
        state.location.isInited = true;
        if (callback) {
          later(callback);
        }
        return LocationManager;
      }),
    getLocation: (callback) =>
      record("LocationManager.getLocation", [callback], () => {
        if (!state.location.isInited) {
          throw new Error("WebAppLocationManagerNotInited: call LocationManager.init first");
        }
        state.location.isAccessRequested = true;
        state.location.isAccessGranted = answers.location !== null;
        const location = answers.location === null ? null : { ...answers.location };
        later(() => callback(location));
        return LocationManager;
      }),
    openSettings: () => record("LocationManager.openSettings", [], () => LocationManager),
  };

  const DeviceStorage: FakeWebApp["DeviceStorage"] = {
    setItem: (key, value, callback) =>
      record("DeviceStorage.setItem", callback ? [key, value, callback] : [key, value], () => {
        storage.set(key, String(value));
        if (callback) {
          later(() => callback(null, true));
        }
        return DeviceStorage;
      }),
    getItem: (key, callback) =>
      record("DeviceStorage.getItem", [key, callback], () => {
        const value = storage.has(key) ? (storage.get(key) as string) : null;
        later(() => callback(null, value));
        return DeviceStorage;
      }),
    removeItem: (key, callback) =>
      record("DeviceStorage.removeItem", callback ? [key, callback] : [key], () => {
        storage.delete(key);
        if (callback) {
          later(() => callback(null, true));
        }
        return DeviceStorage;
      }),
    clear: (callback) =>
      record("DeviceStorage.clear", callback ? [callback] : [], () => {
        storage.clear();
        if (callback) {
          later(() => callback(null, true));
        }
        return DeviceStorage;
      }),
  };

  const webApp: FakeWebApp = {
    version: config.version,
    platform: config.platform,
    initData: config.initData,
    initDataUnsafe,
    get colorScheme() {
      return state.colorScheme;
    },
    get themeParams() {
      return state.themeParams;
    },
    get isExpanded() {
      return state.isExpanded;
    },
    get viewportHeight() {
      return state.viewport.height;
    },
    get viewportStableHeight() {
      return state.viewport.stableHeight;
    },
    get isFullscreen() {
      return state.isFullscreen;
    },
    get isVerticalSwipesEnabled() {
      return state.isVerticalSwipesEnabled;
    },
    get safeAreaInset() {
      return { ...state.safeArea };
    },
    get contentSafeAreaInset() {
      return { ...state.contentSafeArea };
    },
    isVersionAtLeast: (version) => versionAtLeast(version),
    ready: () => record("ready", [], () => undefined),
    expand: () =>
      record("expand", [], () => {
        state.isExpanded = true;
      }),
    close: () =>
      record("close", [], () => {
        state.closed = true;
      }),
    onEvent: (eventType, callback) => record("onEvent", [eventType, callback], () => on(eventType, callback)),
    offEvent: (eventType, callback) => record("offEvent", [eventType, callback], () => off(eventType, callback)),
    setHeaderColor: (color) => record("setHeaderColor", [color], () => checkColor("setHeaderColor", color)),
    setBackgroundColor: (color) => record("setBackgroundColor", [color], () => checkColor("setBackgroundColor", color)),
    disableVerticalSwipes: () =>
      record("disableVerticalSwipes", [], () => {
        state.isVerticalSwipesEnabled = false;
      }),
    enableVerticalSwipes: () =>
      record("enableVerticalSwipes", [], () => {
        state.isVerticalSwipesEnabled = true;
      }),
    requestFullscreen: () =>
      record("requestFullscreen", [], () => {
        state.isFullscreen = true;
        later(() => emit("fullscreenChanged"));
      }),
    exitFullscreen: () =>
      record("exitFullscreen", [], () => {
        state.isFullscreen = false;
        later(() => emit("fullscreenChanged"));
      }),
    showConfirm: (message, callback) =>
      record("showConfirm", callback ? [message, callback] : [message], () => {
        const confirmed = answers.confirm;
        later(() => callback?.(confirmed));
      }),
    showAlert: (message, callback) =>
      record("showAlert", callback ? [message, callback] : [message], () => {
        later(() => callback?.());
      }),
    openLink: (url, options) => record("openLink", options ? [url, options] : [url], () => checkUrl(url, false)),
    openTelegramLink: (url) => record("openTelegramLink", [url], () => checkUrl(url, true)),
    shareMessage: (messageId, callback) =>
      record("shareMessage", callback ? [messageId, callback] : [messageId], () => {
        if (state.share !== null) {
          throw new Error("WebAppShareMessageOpened");
        }
        const sent = answers.shareSent;
        state.share = { callback };
        if (sent === "stuck") {
          return;
        }
        later(() => {
          state.share = null;
          callback?.(sent);
        });
      }),
    requestWriteAccess: (callback) =>
      record("requestWriteAccess", callback ? [callback] : [], () => {
        const allowed = answers.writeAccess;
        later(() => {
          emit("writeAccessRequested", { status: allowed ? "allowed" : "cancelled" });
          callback?.(allowed);
        });
      }),
    checkHomeScreenStatus: (callback) =>
      record("checkHomeScreenStatus", callback ? [callback] : [], () => {
        const status = answers.homeScreenStatus;
        later(() => callback?.(status));
      }),
    addToHomeScreen: () => record("addToHomeScreen", [], () => undefined),
    BackButton: bottomButton("BackButton", "backButtonClicked", "backVisible"),
    SettingsButton: bottomButton("SettingsButton", "settingsButtonClicked", "settingsVisible"),
    HapticFeedback,
    LocationManager,
    DeviceStorage,
  };

  const webView = {
    /** Only `prepared_message_failed` is modelled: it closes a stale share window, as in the real SDK. */
    receiveEvent: (eventType: string, eventData?: unknown): void => {
      if (eventType !== "prepared_message_failed" || state.share === null) {
        return;
      }
      const pending = state.share;
      state.share = null;
      pending.callback?.(false);
      emit("shareMessageFailed", eventData);
    },
  };

  const fake: FakeTelegram = {
    webApp,
    calls,
    answers,
    get closed() {
      return state.closed;
    },
    emit,
    setColorScheme: (scheme) => {
      state.colorScheme = scheme;
      state.themeParams = { ...config.palettes[scheme] };
      emit("themeChanged");
    },
    setSafeArea: (partial) => {
      if (!versionAtLeast(gates.safeArea)) {
        throw unsupported("safeArea", gates.safeArea);
      }
      state.safeArea = { ...state.safeArea, ...partial };
      writeCss();
      emit("safeAreaChanged");
    },
    setViewport: (viewport) => {
      state.viewport = { ...state.viewport, ...viewport };
      writeCss();
      emit("viewportChanged", { isStateStable: true });
    },
    uninstall: () => {
      for (const name of cssVariables) {
        document.documentElement.style.removeProperty(name);
      }
      delete host.Telegram;
      delete host.__homiFakeTelegram;
    },
  };

  writeCss();
  host.Telegram = { WebApp: webApp, WebView: webView };
  host.__homiFakeTelegram = fake;
  return fake;
}
