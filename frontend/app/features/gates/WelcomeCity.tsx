"use client";

import { defaultFilters, pickCity, toSearchParams } from "@homi/search";
import { Skeleton } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";

import { CityList } from "@/features/city/CityList";
import { updateSettings } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { routes } from "@/lib/navigation/routes";
import { useCitiesStats, useReference } from "@/lib/reference/useReference";
import { useSession } from "@/lib/session/SessionProvider";
import { storageSet } from "@/lib/storage";

import { gateState } from "./gateState";
import { GateWait } from "./GateWait";

/** Row 6 is passed for this launch, and row 7 returns to the feed of the picked city; written from the pick only. */
function rememberPick(feed: string): void {
  gateState.cityPicked = true;
  gateState.returnTo = feed;
}

function CitySkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-2.5">
      <Skeleton className="h-8 w-56" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-1.5 py-1">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      ))}
    </div>
  );
}

/**
 * The first-launch city (SCR-005, `/welcome/city`): «Где ищете жильё?» over the city list with the location row and
 * the counts of every city (`useCitiesStats`, D-S-12). It blocks: no ×, no checkmark, no Back (the gates hide it),
 * nothing to drag or tap away; only a pick leaves it. Legacy shows it as a sheet over the feed; the page is the
 * accepted difference of `25` §3.2.
 *
 * A pick (D-S-10): the city change of BR-APP-009 on the default filters (`pickCity`); `PATCH /settings` fired and not
 * awaited, its errors ignored — legacy `saveCity(code, true)` applies the pick at once and drops a failed save, which
 * changes nothing on screen; `homi-city`; the gate memory — the pick, and the feed of that city as the return
 * address; then `patchMe`, without which the profile's old city would win `cityFallback` on the next address without
 * a city. `GateRedirector` (row 7) then replaces the address once; until it does, a second pick — a double tap, or
 * another row — is ignored. A position still on its way when the page is left is dropped by `CityList`. The gate never
 * sends here with one city; a direct load still works. The title takes the focus when the list shows: the page
 * replaces the route that may have held it, and Next.js moves none.
 */
export function WelcomeCity() {
  const t = useTranslations();
  const { status, patchMe } = useSession();
  const { cities, findCity } = useReference();
  const { stats } = useCitiesStats();
  const save = useAction(updateSettings);
  const picked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const ready = status === "ready";

  // Leaving (unmount, or the route hidden by `cacheComponents`): a page shown again takes a pick again.
  useLayoutEffect(
    () => () => {
      picked.current = false;
    },
    [],
  );

  useEffect(() => {
    if (ready) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [ready]);

  if (!ready) {
    return (
      <GateWait>
        <CitySkeleton />
      </GateWait>
    );
  }

  const pick = (code: string) => {
    const city = picked.current ? null : findCity(code);
    if (city === null) {
      return;
    }
    picked.current = true;
    const filters = pickCity(defaultFilters(), city);
    void save({ city: city.code });
    storageSet("homi-city", city.code);
    rememberPick(routes.feed(toSearchParams(filters)));
    patchMe({ city: city.code, city_chosen: true });
  };

  return (
    <div className="flex flex-col">
      <h1
        ref={heading}
        tabIndex={-1}
        className="px-5 pt-2.5 pb-1.5 text-[26px] font-bold tracking-[-0.03em] text-text outline-none"
      >
        {t("city.firstTitle")}
      </h1>
      <CityList cities={cities} stats={stats} showLocate onPick={pick} />
    </div>
  );
}
