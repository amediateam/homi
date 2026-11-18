"use client";

import type { SearchFilters } from "@homi/search";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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

import { type RadarEntry, useSubscribe } from "./subscribe";
import { useRadarsOffRedirect } from "./useRadarsOffRedirect";

/** The new-radar sheet has no «Показать» (the search sheet's, WP-25) and no «Сохранить» (the editor's). */
const nothing = (): void => undefined;

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
 * `useSubscribe().subscribe(draft, entry, relaxed, { scope: "sheet" })` while its button is disabled: on `ok` the sheet
 * closes (`back()`) and the toast shows over the page below; otherwise the sheet stays with its draft and the toast
 * shows inside it. `entry` is the address's `entry` when it is `return` (the return banner's «Настроить») or `feed`
 * (the radar card's «Настроить радар», BR-APP-073), else `empty` («+», the empty tab, a direct load). Closing without
 * saving drops the draft. While radars are switched off (DEC-51) it renders nothing and gives way to the tab.
 */
export function RadarCreateSheet({ presentation, flags = devFlags }: { presentation: RoutePresentation; flags?: DevFlags }) {
  const off = useRadarsOffRedirect();
  const { bfcacheId } = useRouter();
  const address = useSearchParams();
  const params = new URLSearchParams(address?.toString() ?? "");
  const { filters } = useSearchState();
  const { back } = useBack();
  const { subscribe } = useSubscribe({ flags });
  const [submitting, setSubmitting] = useState(false);
  const rules = searchRules(flags);
  const rawEntry = params.get("entry");
  const entry: RadarEntry = isRadarNewEntry(rawEntry) ? rawEntry : "empty";
  const initial = startFilters(params, filters);

  if (off) {
    return null;
  }

  const create = (draft: SearchFilters, relaxed: string | null) => {
    if (submitting) {
      return;
    }
    tg.haptic.impact("medium");
    setSubmitting(true);
    void subscribe(draft, entry, relaxed, { scope: "sheet" }).then(
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
