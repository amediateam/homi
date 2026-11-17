"use client";

import { normalizeFilters, type SearchFilters } from "@homi/search";
import { useCallback, useState } from "react";

export interface DraftApi {
  /** The filters being edited; always normalised, so no key is ever `undefined` (LB-APP-007). */
  draft: SearchFilters;
  /** Merges `patch` into the draft, then normalises the result. */
  update: (patch: Partial<SearchFilters>) => void;
  /** The whole draft, normalised («Сбросить», a relax option); keeps `relaxed`. */
  replace: (filters: unknown) => void;
  /** The code of the relax option last taken, sent with a later subscribe or save (WP-30). */
  relaxed: string | null;
  setRelaxed: (code: string | null) => void;
}

/**
 * The local draft of a filters sheet (WP-25, `25` §3.2): the sheet edits it and the address sees it only on apply.
 * `initial` seeds it once; a fresh open starts from the address because the form is keyed on the router's
 * `bfcacheId`, which remounts it. Every change goes through `normalizeFilters` (fix of LB-APP-007, owned by WP-22), so
 * what the count, the comparison and the apply read is a complete filter set. A replaced draft without a city — a relax
 * option of the server lacking one — keeps the draft's city instead of falling back to Tashkent (SEC-REQ-017: server
 * filters are re-normalised before use).
 */
export function useDraft(initial: SearchFilters): DraftApi {
  const [draft, setDraft] = useState(() => normalizeFilters(initial));
  const [relaxed, setRelaxed] = useState<string | null>(null);

  const update = useCallback((patch: Partial<SearchFilters>) => {
    setDraft((current) => normalizeFilters({ ...current, ...patch }));
  }, []);

  const replace = useCallback((filters: unknown) => {
    setDraft((current) => normalizeFilters(filters, { fallbackCity: current.city }));
  }, []);

  return { draft, update, replace, relaxed, setRelaxed };
}
