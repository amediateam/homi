"use client";

import { defaultFilters, normalizeSort, type SearchFilters, sortOptions, toSearchParams } from "@homi/search";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useSaveCity } from "@/features/city/useCityPick";
import { subscribe } from "@/features/radars/subscribe";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { reportError } from "@/lib/errors/report";
import { devFlags } from "@/lib/flags";
import { closeThen } from "@/lib/navigation/closeThen";
import { routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { refreshCitiesStats, useReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { useSearchState } from "@/lib/search/useSearchState";
import { tg } from "@/lib/telegram";
import { requestDraw } from "@/lib/ui/shellState";

import { applyFilters } from "./applyFilters";
import { FiltersForm } from "./FiltersForm";

/** The search sheet has no «Сохранить»: that is the radar editor's (WP-30). */
const noSave = (): void => undefined;

/**
 * The form's key, computed here only (WP-25 "State and navigation"; swap it here if a browser disproves it).
 * `bfcacheId` changes when a push or replace opens the sheet afresh and stays through back/forward and the shallow
 * `pick=city` layer, so every open starts from the address while the nested picker keeps the draft. An address
 * without a city also keys on the city it falls back to: the hydration render of a direct load does not know the
 * saved city yet (`useSearchState`), and the draft must not keep the city it was first seeded with.
 */
function formKey(bfcacheId: string, address: URLSearchParams | null, city: string): string {
  return address?.has("city") ? bfcacheId : `${bfcacheId}:${city}`;
}

/**
 * The full filters sheet at `/filters` (SCR-014, WP-25): `FiltersForm` in search mode over the live search of the
 * address (`useSearchState`), and the one place its flags are read (`searchRules(devFlags)`, `dev021OneFlowVocabulary`).
 *
 * - Opening refreshes the cities' statistics once (legacy did on every open), errors ignored.
 * - `focus=pets` (BR-APP-057, legacy `useAppBootstrap.js:114-123`): a search that is not long-term rent — daily rent
 *   included — starts from the long-term defaults of its city; the form scrolls to the pets section.
 * - «Показать …»: a medium impact; the draft's city saved when the nested picker changed it (`useSaveCity`); then
 *   `applyFilters` to the map with `from=map`, else to the feed — the sort kept only where the city still offers it.
 * - «Включить радар»: `subscribe(draft, "filters", relaxed)` while the button is disabled; on success the sheet
 *   closes without applying, on failure it stays (the toasts are WP-30's).
 * - «Обвести на карте»: the city saved when it changed, `requestDraw()`, then `closeThen` to the map with the draft
 *   without districts and zones and no `draw` parameter (the map opens drawing as a pushed layer, WP-28).
 *
 * ×, the backdrop, the drag and Telegram's Back close without a change (`RouteSheet`).
 */
export function FiltersSheetRoute({ presentation }: { presentation: RoutePresentation }) {
  const { bfcacheId } = useRouter();
  const address = useSearchParams();
  const { filters, sort } = useSearchState();
  const { findCity } = useReference();
  const { back } = useBack();
  const saveCity = useSaveCity();
  const [submitting, setSubmitting] = useState(false);
  const rules = searchRules(devFlags);
  const focus = address?.get("focus") ?? null;
  const target = address?.get("from") === "map" ? routes.map : routes.feed;

  useEffect(() => {
    void refreshCitiesStats();
  }, []);

  const initial = focus === "pets" && filters.deal !== "rent_long" ? defaultFilters("rent_long", filters.city) : filters;

  const keepCity = (draft: SearchFilters) => {
    if (draft.city !== filters.city) {
      saveCity(draft.city);
    }
  };

  const apply = (draft: SearchFilters) => {
    tg.haptic.impact("medium");
    keepCity(draft);
    void applyFilters(draft, { sort, target, city: findCity(draft.city), rules });
  };

  const subscribeDraft = (draft: SearchFilters, relaxed: string | null) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    void subscribe(draft, "filters", relaxed).then(
      (result) => {
        setSubmitting(false);
        if (result.ok) {
          back();
        }
      },
      (error: unknown) => {
        setSubmitting(false);
        reportError(error, { kind: "error", where: "subscribe" });
      },
    );
  };

  const draw = (cleared: SearchFilters) => {
    keepCity(cleared);
    requestDraw();
    const kept = normalizeSort(sort, sortOptions(cleared, findCity(cleared.city)));
    void closeThen(routes.map(toSearchParams(cleared, kept)));
  };

  return (
    <FiltersForm
      key={formKey(bfcacheId, address, filters.city)}
      mode="search"
      initial={initial}
      focus={focus}
      presentation={presentation}
      route="filters"
      rules={rules}
      oneVocabulary={devFlags.dev021OneFlowVocabulary}
      onApply={apply}
      onSubscribe={subscribeDraft}
      onSave={noSave}
      onDraw={draw}
      submitting={submitting}
    />
  );
}
