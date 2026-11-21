"use client";

import { useMemo, useSyncExternalStore } from "react";

import { bffFetch } from "@/lib/api/browser";

import { cityStatsOf } from "./cityStats";
import { DEFAULT_OWNER_LISTINGS, DEFAULT_OWNER_PHOTOS, DEFAULT_RADAR_LIMIT, EMPTY_REFERENCE } from "./empty";
import type { Cached, City, CityStats, Reference } from "./types";

/**
 * The reference data on the client (WP-22): fed by `ReferenceProvider` from the cached server call, read with
 * `useReference()`, `useCityStats()` and `useCitiesStats()`. Until it arrives — and whenever the API could not be
 * read — the defaults hold: radar limit 10, `radars_enabled` false (no radar is offered), no support account (its
 * rows are hidden), no cities (nothing that needs a city is offered).
 */

interface State {
  reference: Cached<Reference>;
  cities: Cached<CityStats[]>;
}

const EMPTY: State = { reference: { loaded: false, data: EMPTY_REFERENCE }, cities: { loaded: false, data: [] } };
let state: State = EMPTY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setReference(next: State): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Forgets the fed data; tests only. */
export function resetReference(): void {
  setReference(EMPTY);
}

let refreshing: Promise<void> | null = null;

/**
 * Reads `GET /cities` again in the browser and replaces the city statistics with the answer (WP-25: legacy refreshed
 * them on every open of the full filters sheet). The reference part is left as it is. Only the elements with a code
 * are kept (`cityStatsOf`, as the server loader does); a failed answer, or one that is not a list, changes nothing and
 * is not reported — the cached statistics, or none, stay on screen. Opens close together share one request. Never
 * rejects.
 */
export function refreshCitiesStats(): Promise<void> {
  refreshing ??= bffFetch<unknown>("cities")
    .then(
      (result) => {
        const data = result.ok ? cityStatsOf(result.data) : null;
        if (result.ok && data !== null) {
          const source = result.meta.source;
          setReference({ ...state, cities: { loaded: true, data, ...(source === undefined ? {} : { source }) } });
        }
      },
      () => undefined,
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function useState(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

export interface ReferenceView {
  loaded: boolean;
  reference: Reference;
  cities: readonly City[];
  findCity: (code: string | null | undefined) => City | null;
  radarsEnabled: boolean;
  radarLimit: number;
  /** The owner cabinet's switch (DEC-81): `owner_enabled === true`; false while the reference data is missing. */
  ownerEnabled: boolean;
  /** Listings per account and per phone, photos per listing (WP-80; LB-APP-057: never a number in a text). */
  ownerListingsLimit: number;
  ownerPhotosLimit: number;
  botUsername: string | null;
  supportUsername: string | null;
  usdUzs: number;
}

export function useReference(): ReferenceView {
  const { reference } = useState();
  const data = reference.data as Partial<Reference>;
  const cities = Array.isArray(data.cities) ? data.cities : [];
  const limit = data.limits?.radars;
  const positive = (value: unknown, fallback: number) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback);
  return {
    loaded: reference.loaded,
    reference: reference.data,
    cities,
    findCity: (code) => cities.find((city) => city.code === code) ?? null,
    radarsEnabled: data.radars_enabled === true,
    radarLimit: positive(limit, DEFAULT_RADAR_LIMIT),
    ownerEnabled: data.owner_enabled === true,
    ownerListingsLimit: positive(data.limits?.owner_listings, DEFAULT_OWNER_LISTINGS),
    ownerPhotosLimit: positive(data.limits?.owner_photos, DEFAULT_OWNER_PHOTOS),
    botUsername: data.bot?.username || null,
    supportUsername: data.bot?.support_username || null,
    usdUzs: typeof data.rates?.usd_uzs === "number" ? data.rates.usd_uzs : 0,
  };
}

/** `counts`, `price_presets` and `typical_price` of one city from `GET /cities`; `null` when unknown. */
export function useCityStats(code: string | null | undefined): CityStats | null {
  const { cities } = useState();
  return cities.data.find((city) => city.code === code) ?? null;
}

/**
 * The stats of every city of `GET /cities`, by code (WP-23, D-S-12: the counts of the city list). `stats` is `null`
 * while they are not there and when the API could not be read: the rows go without their count line then.
 */
export function useCitiesStats(): { stats: Record<string, CityStats> | null; loaded: boolean } {
  const { cities } = useState();
  return useMemo(
    () => ({ stats: cities.loaded ? Object.fromEntries(cities.data.map((city) => [city.code, city])) : null, loaded: cities.loaded }),
    [cities],
  );
}
