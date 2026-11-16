"use client";

import { Check, cn, LocateFixed, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type RefObject, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { type DevFlags, devFlags } from "@/lib/flags";
import type { CityStats } from "@/lib/reference/types";
import { LOCATION_TIMEOUT_MS, tg } from "@/lib/telegram";
import type { LocationResult } from "@/lib/telegram/location";

import { type CityPlace, nearestCity } from "./nearestCity";

/** A city row: the reference city's code, its server name, and what the nearest-city rule reads. */
export type CityListCity = CityPlace & { readonly name: string };

type LocateError = "city.locateDenied" | "city.locateFail" | "city.locateFar";

export interface CityListProps {
  cities: readonly CityListCity[];
  /** The counts by city code (`useCitiesStats()`); `null` while they load or when they failed: no count line then. */
  stats: Readonly<Record<string, Pick<CityStats, "counts">>> | null;
  /** The city of the search; marked only with `showCheck`. */
  current?: string | null;
  showCheck?: boolean;
  /** Offer «Определить по геопозиции» — shown only where the adapter can ask for a position (TMA-035). */
  showLocate?: boolean;
  /** A row was tapped, or the position found a city. */
  onPick: (code: string) => void;
  flags?: DevFlags;
  className?: string;
}

const ROW = "flex w-full items-center gap-3 border-b-[0.5px] border-sep px-1 py-[13px] text-left last:border-b-0";

const noSubscription = () => () => undefined;

/** Drops the location request in flight (its answer no longer matches) and its 12 s timer; the new attempt's id. */
function cancel(attempt: RefObject<number>, timer: RefObject<ReturnType<typeof setTimeout> | null>): number {
  attempt.current += 1;
  if (timer.current !== null) {
    clearTimeout(timer.current);
    timer.current = null;
  }
  return attempt.current;
}

/**
 * The city list of the first-launch page and of the city sheet (WP-23, SCR-005 and SCR-017; WP-25 wraps it in its sheets):
 * an optional location row, then one row per city with its name and, when the stats are known, «{rent} аренда ·
 * {sale} продажа» — long-term rent and sale only, as legacy (LB-APP-035); DEV-023 adds daily rent. It knows no gate
 * and no sheet: the caller decides what a pick does.
 *
 * The location row asks the adapter once per tap (light haptic), says «Определяем…» with a spinner and is disabled
 * meanwhile. Refused → `city.locateDenied`; failed, or nothing after 12 s → `city.locateFail` (the bound is kept here
 * too, because the browser's geolocation timeout does not count the permission prompt); no city in range →
 * `city.locateFar`; found → success haptic and the city is picked at once. A position arriving after the list was
 * left — unmounted, or hidden with its route — or after a row was tapped is dropped. The position stays on the
 * device (`nearestCity` is pure).
 *
 * The row's progress and its error are announced by a status line beside the button, which also describes it: a live
 * region inside a button is not reliably read (its content is presentational). The row is disabled with
 * `aria-disabled`, so the focus of the tap stays on it; `locate()` ignores a tap while a position is on its way.
 */
export function CityList({
  cities,
  stats,
  current = null,
  showCheck = false,
  showLocate = false,
  onPick,
  flags = devFlags,
  className,
}: CityListProps) {
  const t = useTranslations();
  // The server and the hydration pass never offer the row: whether a position can be asked is the device's answer.
  const canLocate = useSyncExternalStore(noSubscription, tg.location.available, () => false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocateError | null>(null);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ cities, onPick });
  const statusId = useId();

  useLayoutEffect(() => {
    latest.current = { cities, onPick };
  });

  // Leaving (unmount, or the route hidden by `cacheComponents`) drops the position on its way and the spinner.
  useLayoutEffect(
    () => () => {
      cancel(attempt, timer);
      setLocating(false);
    },
    [],
  );

  const finish = (result: LocationResult) => {
    setLocating(false);
    if (result === "denied" || result === "fail") {
      setError(result === "denied" ? "city.locateDenied" : "city.locateFail");
      return;
    }
    const city = nearestCity(result, latest.current.cities);
    if (city === null) {
      setError("city.locateFar");
      return;
    }
    tg.haptic.success();
    latest.current.onPick(city.code);
  };

  const locate = () => {
    if (locating) {
      return;
    }
    tg.haptic.impact();
    const id = cancel(attempt, timer);
    setLocating(true);
    setError(null);
    const timeout = new Promise<LocationResult>((resolve) => {
      timer.current = setTimeout(() => resolve("fail"), LOCATION_TIMEOUT_MS);
    });
    const position = new Promise<LocationResult>((resolve) => resolve(tg.location.get())).catch((): LocationResult => "fail");
    void Promise.race([position, timeout]).then((result) => {
      if (attempt.current !== id) {
        return;
      }
      cancel(attempt, timer);
      finish(result);
    });
  };

  const pick = (code: string) => {
    // A tapped row wins over a position still on its way.
    cancel(attempt, timer);
    setLocating(false);
    tg.haptic.impact();
    onPick(code);
  };

  const countsOf = (code: string): string | null => {
    const counts = stats?.[code]?.counts;
    if (counts === undefined) {
      return null;
    }
    const rent = counts.rent_long ?? 0;
    const sale = counts.sale ?? 0;
    return flags.dev023CityCountsIncludeDaily
      ? t("city.countsDaily", { rent, daily: counts.rent_daily ?? 0, sale })
      : t("city.counts", { rent, sale });
  };

  return (
    <div data-slot="city-list" className={cn("flex flex-col px-4", className)}>
      {showLocate && canLocate ? (
        <>
          <button
            type="button"
            data-row="locate"
            className={cn(ROW, "aria-disabled:opacity-70")}
            aria-disabled={locating}
            aria-describedby={statusId}
            onClick={locate}
          >
            <span aria-hidden className="grid size-8 flex-none place-items-center rounded-pill bg-fill text-text">
              {locating ? <Spinner className="size-4" /> : <LocateFixed size={17} />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <b className="text-[17px] font-semibold tracking-[-0.01em]">{t(locating ? "city.locating" : "city.locate")}</b>
              <span data-locate-error={error ?? undefined} aria-hidden className="text-[14px] text-hint">
                {error === null ? null : t(error)}
              </span>
            </span>
          </button>
          <p id={statusId} role="status" data-locate-status="" className="sr-only">
            {locating ? t("city.locating") : error === null ? null : t(error)}
          </p>
        </>
      ) : null}
      {cities.map((city) => {
        const selected = showCheck && city.code === current;
        const line = countsOf(city.code);
        return (
          <button
            key={city.code}
            type="button"
            data-city={city.code}
            className={ROW}
            aria-pressed={showCheck ? selected : undefined}
            onClick={() => pick(city.code)}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <b className="text-[19px] font-semibold tracking-[-0.01em]">{city.name}</b>
              {line === null ? null : <span className="text-[14px] text-hint">{line}</span>}
            </span>
            {selected ? (
              <span aria-hidden className="grid size-[26px] flex-none place-items-center rounded-pill bg-text text-bg">
                <Check size={15} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
