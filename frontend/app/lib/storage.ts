import { deviceStorage } from "@/lib/telegram/deviceStorage";

/**
 * The Mini App's client storage (WP-21). One table of keys with their policy: `synced` keys are mirrored to
 * Telegram's DeviceStorage and restored from it on a new device or after a cleared webview; `local` keys stay in
 * `localStorage`. A key is mirrored only if it is also restored (fix of LB-APP-012). There is no locale key: the
 * locale is the address segment plus next-intl's cookie.
 */

/** `homi-new-<feature>` markers in use. */
export const NEW_FEATURES = ["pets"] as const;
type NewFeature = (typeof NEW_FEATURES)[number];

export type SyncedKey = "homi-city" | "homi-nudge" | "homi-visits" | "homi-home" | `homi-new-${NewFeature}`;
export type LocalKey =
  | "homi-theme"
  | "homi-graphics"
  | "homi-graphics-measured"
  | "homi-map-engine"
  | `homi-map-fit:${number},${number}`;
export type StorageKey = SyncedKey | LocalKey;

export const STORAGE_POLICY = {
  "homi-city": "synced",
  "homi-nudge": "synced",
  "homi-visits": "synced",
  "homi-home": "synced",
  "homi-new-pets": "synced",
  "homi-theme": "local",
  "homi-graphics": "local",
  "homi-graphics-measured": "local",
  "homi-map-engine": "local",
} as const satisfies Record<SyncedKey | Exclude<LocalKey, `homi-map-fit:${string}`>, "synced" | "local">;

const SYNCED_KEYS = (Object.keys(STORAGE_POLICY) as (keyof typeof STORAGE_POLICY)[]).filter(
  (key): key is SyncedKey => STORAGE_POLICY[key] === "synced",
);

/** TMA-037: each key of the restore waits at most this long for DeviceStorage. */
export const RESTORE_TIMEOUT_MS = 1500;

/** Launch data (`hash=`, `auth_date=`, `query_id=`) or a bearer token never goes into a store (SEC-REQ-007). */
const SECRET_SHAPES = [/(^|[?&#])(hash|auth_date|query_id)=/, /tgWebAppData/, /\bbearer\s+\S/i, /^\d+\|[A-Za-z0-9]{40,}/];

function looksSecret(value: string): boolean {
  return SECRET_SHAPES.some((shape) => shape.test(value));
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSynced(key: StorageKey): key is SyncedKey {
  return (SYNCED_KEYS as string[]).includes(key);
}

const listeners = new Set<() => void>();

/**
 * Called after every write of this module (`storageSet`, the DeviceStorage restore), for `useSyncExternalStore`
 * readers of a key (the saved city of `useSearchState`). Writes of another document are not reported.
 */
export function subscribeStorage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function storageGet(key: StorageKey): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** `null` removes the key. A refused store makes this a no-op; the app still starts. */
export function storageSet(key: StorageKey, value: string | null): void {
  if (value !== null && looksSecret(value)) {
    return;
  }
  try {
    if (value === null) {
      local()?.removeItem(key);
    } else {
      local()?.setItem(key, value);
    }
  } catch {
    // Storage disabled or full: the value lives for this launch only.
  }
  notify();
  if (isSynced(key) && deviceStorage.available()) {
    void (value === null ? deviceStorage.removeItem(key) : deviceStorage.setItem(key, value));
  }
}

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/**
 * Fills the synced keys that are missing locally from DeviceStorage (fix of LB-APP-021): all keys in parallel, at
 * most 1.5 s each, never rejects. The session bootstrap awaits it with the SDK wait, before the first data request.
 */
export async function restoreFromDeviceStorage(): Promise<void> {
  if (!deviceStorage.available()) {
    return;
  }
  await Promise.all(
    SYNCED_KEYS.filter((key) => storageGet(key) === null).map(async (key) => {
      const value = await within(deviceStorage.getItem(key), RESTORE_TIMEOUT_MS, null);
      if (value !== null && !looksSecret(value)) {
        try {
          local()?.setItem(key, value);
        } catch {
          // Refused store: the restored value is dropped.
        }
      }
    }),
  );
  notify();
}
