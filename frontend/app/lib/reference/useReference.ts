"use client";

import { useMemo, useSyncExternalStore } from "react";

import { DEFAULT_RADAR_LIMIT, EMPTY_REFERENCE } from "./empty";
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
  botUsername: string | null;
  supportUsername: string | null;
  usdUzs: number;
}

export function useReference(): ReferenceView {
  const { reference } = useState();
  const data = reference.data as Partial<Reference>;
  const cities = Array.isArray(data.cities) ? data.cities : [];
  const limit = data.limits?.radars;
  return {
    loaded: reference.loaded,
    reference: reference.data,
    cities,
    findCity: (code) => cities.find((city) => city.code === code) ?? null,
    radarsEnabled: data.radars_enabled === true,
    radarLimit: typeof limit === "number" && Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_RADAR_LIMIT,
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
