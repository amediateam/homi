import { supportsFeature } from "./gates";
import { insideTelegram } from "./sdk";
import type { TgWebApp } from "./types";

/** TMA-035: the whole request never takes longer than this (fix of LB-APP-009). */
export const LOCATION_TIMEOUT_MS = 12_000;
const MAX_AGE_MS = 60_000;

export type LocationResult = { lat: number; lon: number; accuracy: number | null } | "denied" | "fail";

type Manager = NonNullable<TgWebApp["LocationManager"]>;

function manager(): Manager | null {
  const app = insideTelegram();
  return app !== null && supportsFeature(app.version, "locationManager") ? (app.LocationManager ?? null) : null;
}

function geolocation(): Geolocation | null {
  return typeof navigator === "undefined" ? null : (navigator.geolocation ?? null);
}

export function locationAvailable(): boolean {
  return manager() !== null || geolocation() !== null;
}

function viaBrowser(): Promise<LocationResult> {
  const geo = geolocation();
  if (geo === null) {
    return Promise.resolve("fail");
  }
  return new Promise((resolve) => {
    // `timeout` on getCurrentPosition does not run while the permission prompt is open (AM-64).
    const timer = setTimeout(() => resolve("fail"), LOCATION_TIMEOUT_MS);
    const done = (result: LocationResult): void => {
      clearTimeout(timer);
      resolve(result);
    };
    try {
      geo.getCurrentPosition(
        (position) => done({ lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy ?? null }),
        (error) => done(error.code === 1 ? "denied" : "fail"),
        { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: MAX_AGE_MS },
      );
    } catch {
      done("fail");
    }
  });
}

function viaTelegram(target: Manager): Promise<LocationResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("fail"), LOCATION_TIMEOUT_MS);
    const done = (result: LocationResult): void => {
      clearTimeout(timer);
      resolve(result);
    };
    const request = (): void => {
      if (target.isAccessRequested === true && target.isAccessGranted !== true) {
        done("denied");
        return;
      }
      if (target.isLocationAvailable === false || typeof target.getLocation !== "function") {
        void viaBrowser().then(done);
        return;
      }
      target.getLocation((location) =>
        done(location ? { lat: location.latitude, lon: location.longitude, accuracy: location.horizontal_accuracy ?? null } : "denied"),
      );
    };
    try {
      if (target.isInited === true) {
        request();
      } else {
        target.init?.(request);
      }
    } catch {
      done("fail");
    }
  });
}

let pending: Promise<LocationResult> | null = null;

/**
 * The user's position (TMA-035): LocationManager from 8.0, else browser geolocation (high accuracy, at most 60 s
 * old). Either path settles within `LOCATION_TIMEOUT_MS`, including while a permission prompt is open. One
 * request at a time; the coordinates are handed to the caller only — never stored, logged or sent.
 */
export function getLocation(): Promise<LocationResult> {
  if (pending === null) {
    const target = manager();
    pending = (target !== null ? viaTelegram(target) : viaBrowser()).finally(() => {
      pending = null;
    });
  }
  return pending;
}
