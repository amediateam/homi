"use client";

import { Suspense, useEffect } from "react";

import { currentNetwork } from "@/features/feed/images";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";

import { cityViewOf } from "./camera";
import { currentEngine, warmMap } from "./engine";
import { budgetFor, prefetchTiles } from "./tilePrefetch";
import { isTileTemplate } from "./tiles";

/** How long the list must stay at one address before the map is warmed up (KV-FE-062). */
export const WARMUP_DELAY_MS = 2_500;

function Warmup() {
  const { href, filters } = useScreenSearchState("feed");
  const address = href(routes.feed);
  const { loaded, reference, findCity } = useReference();
  const tiles = loaded ? reference.map.tiles_url : undefined;
  const city = findCity(filters.city);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const lite = document.documentElement.classList.contains("lite");
      const network = currentNetwork();
      if (budgetFor(network, lite).preloadTiles === 0) {
        return;
      }
      warmMap(currentEngine()).catch(() => undefined);
      if (isTileTemplate(tiles)) {
        void prefetchTiles({
          template: tiles,
          city: cityViewOf(city),
          viewport: { width: window.innerWidth, height: window.innerHeight },
          lite,
          network,
          signal: controller.signal,
        });
      }
    }, WARMUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address, city, tiles]);

  return null;
}

/**
 * The map warm-up from the list view (WP-27 "Warm-up and tile prefetch", LB-APP-018): 2.5 s after the list's search
 * stops changing — a new search restarts the wait, leaving the list (unmount, or the route hidden by
 * `cacheComponents`) cancels it — the code of the engine the map will pick is loaded (`warmMap`), and for a
 * `{z}/{x}/{y}` tile template the tiles of the view the map opens on for the current city are prefetched
 * (`prefetchTiles`, aborted on leaving). Nothing runs with Save-Data or on `2g` / `slow-2g`, and nothing while
 * rendering. Renders nothing; its own `<Suspense>` keeps the address read out of the page's static shell.
 */
export function MapWarmup() {
  return (
    <Suspense fallback={null}>
      <Warmup />
    </Suspense>
  );
}
