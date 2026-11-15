"use client";

import { useLayoutEffect } from "react";

import { SourceReporter } from "@/features/shell/SourceReporter";

import type { Cached, CityStats, Reference } from "./types";
import { setReference } from "./useReference";

/**
 * Feeds the cached reference data to `useReference()` (WP-22). Rendered once by the root layout inside
 * `<Suspense>` — the entry may be resolved at request time — next to the page rather than around it, so the page
 * never waits for it; a layout effect hands the data over before the first paint. Its `meta.source` reaches the
 * demo marker like any other server read.
 */
export function ReferenceProvider({ reference, cities }: { reference: Cached<Reference>; cities: Cached<CityStats[]> }) {
  useLayoutEffect(() => setReference({ reference, cities }), [reference, cities]);
  return (
    <>
      <SourceReporter source={reference.loaded ? reference.source : undefined} />
      <SourceReporter source={cities.loaded ? cities.source : undefined} />
    </>
  );
}
