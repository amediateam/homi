"use client";

import { useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback } from "react";

import type { Locale } from "@homi/config";

import type { CityView } from "./types";

const MapViewGL = dynamic(() => import("./gl/MapViewGL"), { ssr: false });

const TASHKENT: CityView = { center: [41.3111, 69.2797], zoom: 12 };

/** SLICE: the screen with the GL view only. */
export function MapScreen() {
  const locale = useLocale() as Locale;
  const onFail = useCallback((reason: string) => console.warn("[map] fail", reason), []);
  return (
    <div className="fixed inset-0">
      <MapViewGL
        groups={[]}
        responseId={0}
        selection={null}
        onSelect={() => undefined}
        onBackground={() => undefined}
        polygon={null}
        cityView={TASHKENT}
        tiles={null}
        locale={locale}
        scheme="light"
        lite={false}
        me={null}
        drawing={false}
        onFail={onFail}
      />
    </div>
  );
}
