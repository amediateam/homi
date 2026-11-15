import { supportsFeature } from "./gates";
import { webApp } from "./sdk";
import type { TgWebApp } from "./types";

type Store = NonNullable<TgWebApp["DeviceStorage"]>;

function store(): Store | null {
  const app = webApp();
  if (app === null || !supportsFeature(app.version, "deviceStorage")) {
    return null;
  }
  return app.DeviceStorage ?? null;
}

/** Runs one DeviceStorage call; a throw or an error answer counts as `fallback`. Never rejects. */
function call<T>(run: (store: Store, done: (value: T) => void) => unknown, fallback: T): Promise<T> {
  const target = store();
  if (target === null) {
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    try {
      run(target, resolve);
    } catch {
      resolve(fallback);
    }
  });
}

/**
 * Telegram's DeviceStorage (TMA-037, 9.0+), promisified. Only `lib/storage.ts` uses it, and only for the keys it
 * also restores (fix of LB-APP-012). Below 9.0 and outside Telegram every call answers at once without touching the
 * SDK.
 */
export const deviceStorage = {
  available(): boolean {
    return store() !== null;
  },
  getItem(key: string): Promise<string | null> {
    return call<string | null>((target, done) => {
      if (typeof target.getItem !== "function") {
        done(null);
        return;
      }
      target.getItem(key, (error, value) => done(error || typeof value !== "string" ? null : value));
    }, null);
  },
  setItem(key: string, value: string): Promise<boolean> {
    return call<boolean>((target, done) => {
      if (typeof target.setItem !== "function") {
        done(false);
        return;
      }
      target.setItem(key, value, (error) => done(!error));
    }, false);
  },
  removeItem(key: string): Promise<boolean> {
    return call<boolean>((target, done) => {
      if (typeof target.removeItem !== "function") {
        done(false);
        return;
      }
      target.removeItem(key, (error) => done(!error));
    }, false);
  },
};
