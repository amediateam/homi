"use client";

import type { SearchFilters } from "@homi/search";
import { useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";

import { FiltersForm } from "@/features/filters/FiltersForm";
import { formKey } from "@/features/filters/formKey";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { reportError } from "@/lib/errors/report";
import { type DevFlags, devFlags } from "@/lib/flags";
import { isRadarNewEntry, searchKeysOf } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { searchStateFromHref } from "@/lib/search/readSearchState";
import { searchRules } from "@/lib/search/rules";
import { useSearchState } from "@/lib/search/useSearchState";
import { tg } from "@/lib/telegram";
import { lastSearchHref } from "@/lib/ui/shellState";

import { useSheetRequest } from "./RadarEditSheet";
import { type RadarEntry, useSubscribe } from "./subscribe";
import { useRadarsOffRedirect } from "./useRadarsOffRedirect";

/** The new-radar sheet has no «Показать» (the search sheet's, WP-25) and no «Сохранить» (the editor's). */
const nothing = (): void => undefined;

/** The `@sheet` copies of the new-radar sheet shown now, each counted while it renders (as `ListingLayer` does). */
let layerCopies = 0;
const layerListeners = new Set<() => void>();

function countLayerCopy(change: 1 | -1): void {
  layerCopies += change;
  for (const listener of layerListeners) {
    listener();
  }
}

function subscribeLayerCopies(listener: () => void): () => void {
  layerListeners.add(listener);
  return () => layerListeners.delete(listener);
}

const layerCopyShown = (): boolean => layerCopies > 0;

/**
 * The filters the sheet starts from (SCR-030): «the last search filters, city included». Every way in builds the
 * address with them — «+» passes `lastSearchQuery()`, the empty tab the same, the return banner and the radar card
 * the search they were shown on — so the address wins when it carries any search key; a bare address (a stale link)
 * takes the shell's last search (`lastSearchHref`), with the city of the address's own fallback chain.
 */
function startFilters(address: URLSearchParams, fromAddress: SearchFilters): SearchFilters {
  if (searchKeysOf(address).toString() !== "") {
    return fromAddress;
  }
  return searchStateFromHref(lastSearchHref(), fromAddress.city).filters;
}

/**
 * The new-radar sheet at `/radars/new` (SCR-030, WP-30) in both trees: `FiltersForm` in `radar-new` mode — «Новый
 * радар», no «Опубликовано», no «Показать», «Сейчас подходит: {n}» and «Включить радар» — keyed with `formKey`, so
 * every fresh open starts from its address; the one reader of the `DEV` flags of the form.
 *
 * «Включить радар» plays a medium impact (legacy `FiltersSheet.jsx` `save`) and runs
 * `useSubscribe().subscribe(draft, entry, relaxed, { scope })` while its button is disabled: on `ok` the sheet
 * closes (`back()`) and the toast shows over the page below; otherwise the sheet stays with its draft and the toast
 * shows inside it. `entry` is the address's `entry` when it is `return` (the return banner's «Настроить») or `feed`
 * (the radar card's «Настроить радар», BR-APP-073), else `empty` («+», the empty tab, a direct load). A sheet the user
 * left while the request ran (Back, ×, a drag) is not closed again — the stale `back()` would step past the page the
 * user went to — and its failure toast shows in the app's host (`useSheetRequest`). Closing without saving drops the
 * draft. While radars are switched off (DEC-51) it renders nothing and gives way to the tab.
 *
 * The standalone copy (a direct load) yields while a `@sheet` copy shows: a directly loaded `/radars/new?pick=city`
 * closes its picker at depth 0 by replacing the address without `pick`, which Next intercepts into `@sheet` while the
 * `children` slot keeps this copy, so two sheets and their dims would stack.
 */
export function RadarCreateSheet({ presentation, flags = devFlags }: { presentation: RoutePresentation; flags?: DevFlags }) {
  const off = useRadarsOffRedirect();
  const layerShown = useSyncExternalStore(subscribeLayerCopies, layerCopyShown, () => false);
  const hidden = off || (presentation === "standalone" && layerShown);
  const { bfcacheId } = useRouter();
  const address = useSearchParams();
  const params = new URLSearchParams(address?.toString() ?? "");
  const { filters } = useSearchState();
  const { back } = useBack();
  const { subscribe } = useSubscribe({ flags });
  const [submitting, setSubmitting] = useState(false);
  const start = useSheetRequest(setSubmitting);
  const rules = searchRules(flags);
  const rawEntry = params.get("entry");
  const entry: RadarEntry = isRadarNewEntry(rawEntry) ? rawEntry : "empty";
  const initial = startFilters(params, filters);

  useLayoutEffect(() => {
    if (presentation !== "layer" || off) {
      return undefined;
    }
    countLayerCopy(1);
    return () => countLayerCopy(-1);
  }, [presentation, off]);

  if (hidden) {
    return null;
  }

  const create = (draft: SearchFilters, relaxed: string | null) => {
    if (submitting) {
      return;
    }
    tg.haptic.impact("medium");
    setSubmitting(true);
    const { here, settle } = start();
    void subscribe(draft, entry, relaxed, { scope: () => (here() ? "sheet" : "app") }).then(
      (result) => {
        const stay = here();
        settle();
        if (result.ok && stay) {
          back();
        }
      },
      (error: unknown) => {
        settle();
        reportError(error, { kind: "error", where: "subscribe" });
      },
    );
  };

  return (
    <FiltersForm
      key={formKey(bfcacheId, params, initial.city)}
      mode="radar-new"
      initial={initial}
      presentation={presentation}
      route="radars/new"
      rules={rules}
      oneVocabulary={flags.dev021OneFlowVocabulary}
      onApply={nothing}
      onSubscribe={create}
      onSave={nothing}
      submitting={submitting}
    />
  );
}
