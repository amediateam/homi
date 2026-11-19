import { useMemo } from "react";

import type { ListingPreview } from "@/features/feed/types";
import type { LiveFlow } from "@/features/filters/flow";

import type { Radar } from "./normalize";

/**
 * What the tab and the sheet show of one radar's preview (BR-APP-063; legacy `catches[id]`): the newest finds (at
 * most five), the listings that match now and the flow. `finds` is `null` while the preview is not there (the list
 * read without `include=previews`, or not loaded): the strip shows its ghosts. A preview the server could not compute
 * (`null`) reads as no finds — legacy rendered «Пока ничего…» for a failed finds request too — with no count and no
 * flow.
 */
export interface RadarFinds {
  finds: ListingPreview[] | null;
  count: number | null;
  flow: LiveFlow | null;
}

const NOT_THERE: RadarFinds = { finds: null, count: null, flow: null };
const NONE: RadarFinds = { finds: [], count: null, flow: null };

/** The finds of one radar's preview (`RadarFinds`); `undefined` for a radar that is not known. */
export function radarFinds(radar: Pick<Radar, "preview"> | undefined): RadarFinds {
  if (radar?.preview === undefined) {
    return NOT_THERE;
  }
  if (radar.preview === null) {
    return NONE;
  }
  return { finds: radar.preview.items, count: radar.preview.count, flow: radar.preview.flow };
}

/**
 * Finds, count and flow per radar id (WP-30 "Previews", the fix of LB-APP-036): it only maps the `preview` of the
 * tab's one `GET /radars?include=previews` — there is no per-radar fallback to the listing methods, so a pull or a
 * new list brings new previews with it and nothing else is requested. The flow already passed `normalizeFlow`.
 */
export function useRadarPreviews(radars: readonly Radar[] | undefined): Readonly<Record<string, RadarFinds>> {
  return useMemo(() => Object.fromEntries((radars ?? []).map((radar) => [radar.id, radarFinds(radar)])), [radars]);
}
