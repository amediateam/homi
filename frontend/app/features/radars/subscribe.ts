"use client";

import type { SearchFilters } from "@homi/search";
import type { components } from "@homi/types";

/**
 * Where a radar was turned on (BR-APP-041, BR-API-086): the filters footer, the new-radar sheet, the few-results
 * note, the follow nudge, the radar card in the feed and the return banner.
 */
export type RadarEntry = components["schemas"]["StoreRadarRequest"]["entry"];

export interface SubscribeResult {
  ok: boolean;
}

/**
 * The subscribe flow of every radar entry point, `subscribe(filters, entry, relaxed?)`. WP-24 stub with the final
 * signature: it resolves `{ ok: false }` and sends nothing, and no caller reaches it while `radarsReady` is `false`.
 * WP-30 writes the body.
 */
export const subscribe: (filters: SearchFilters, entry: RadarEntry, relaxed?: string | null) => Promise<SubscribeResult> =
  async () => ({ ok: false });

/**
 * A radar with the same filters is on (BR-APP-012: `posted_days` ignored), so the entry points hide their «Включить
 * радар». WP-24 stub: `false`; WP-30 answers it from the radar list.
 */
export const useHasActiveRadar: (filters: SearchFilters) => boolean = () => false;
