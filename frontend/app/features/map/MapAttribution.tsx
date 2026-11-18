"use client";

import type { ReactNode } from "react";

import { tg } from "@/lib/telegram";

import type { AttributionKind } from "./tiles";

export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
export const PROTOMAPS_URL = "https://protomaps.com";

/** A link that leaves the app through the adapter (TMA-028), whose allow-list names both hosts. */
function OutsideLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.preventDefault();
        tg.openLink(href);
      }}
      className="underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}

/**
 * The basemap's attribution (WP-27 "Basemap and tiles"): «© OpenStreetMap» on the raster tiles, «© OpenStreetMap ·
 * Protomaps» on the vector basemap; the names link to the OpenStreetMap copyright page and to Protomaps, opened with
 * `tg.openLink`. The strings are not translated, as in legacy.
 */
export function MapAttribution({ kind }: { kind: AttributionKind }) {
  return (
    <div
      data-map-attribution={kind}
      className="pointer-events-auto rounded-[4px] bg-bg/70 px-[4px] text-[10px] leading-[14px] whitespace-nowrap text-hint"
    >
      <OutsideLink href={OSM_COPYRIGHT_URL}>© OpenStreetMap</OutsideLink>
      {kind === "osm-protomaps" ? (
        <>
          {" · "}
          <OutsideLink href={PROTOMAPS_URL}>Protomaps</OutsideLink>
        </>
      ) : null}
    </div>
  );
}
