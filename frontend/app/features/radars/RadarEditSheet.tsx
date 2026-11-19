"use client";

import { normalizeFilters, type SearchFilters } from "@homi/search";
import { ErrorState, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { use, useEffect, useLayoutEffect, useRef, useState } from "react";

import { FiltersForm } from "@/features/filters/FiltersForm";
import { type RoutePresentation, RouteSheet } from "@/features/shell/RouteSheet";
import { usePathname } from "@/i18n/navigation";
import { reportError } from "@/lib/errors/report";
import { type DevFlags, devFlags } from "@/lib/flags";
import { currentAddress } from "@/lib/navigation/address";
import { nav } from "@/lib/navigation/nav";
import { isRadarId, matchRoute, routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { searchRules } from "@/lib/search/rules";
import { tg } from "@/lib/telegram";

import type { Radar } from "./normalize";
import { useSubscribe } from "./subscribe";
import { useRadars } from "./useRadars";
import { useRadarsOffRedirect } from "./useRadarsOffRedirect";

/** The editor has no «Показать» (the search sheet's, WP-25) and no «Включить радар» (the new-radar sheet's). */
const nothing = (): void => undefined;

export interface RadarEditSheetProps {
  /** The `[id]` segment's own params (as `ListingLayer` reads its number): a hidden cached copy keeps its radar. */
  params: Promise<{ id: string }>;
  presentation: RoutePresentation;
  /** The app's flags; tests pass overrides. */
  flags?: DevFlags;
}

const sameId = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();

/**
 * The radar editor at `/radars/<id>/edit` (SCR-029, WP-30) in both trees, over the radar sheet of its `[id]` layout,
 * which stays mounted under it: `FiltersForm` in `radar-edit` mode — «Условия радара», no «Опубликовано», no
 * «Показать», «Сейчас подходит: {n}» and «Сохранить» — started from the radar's filters (`normalizeFilters`) and keyed
 * per opening; the one reader of the `DEV` flags of the form.
 *
 * - The radar comes from the radar tab's list (`useRadars({ previews: true })`, the list the sheet below reads, so no
 *   request of its own). Until it is there the sheet shows its title and a spinner — or the list's error with
 *   «Повторить» — so a direct load's server HTML and a launch still signing in already hold `data-route`.
 * - A radar the loaded list does not hold (deleted in the bot, an unknown id): `nav.replace(routes.radars())`, once.
 * - «Сохранить»: a medium impact, then `useSubscribe().saveEdit(id, draft, relaxed, { scope })` while the button is
 *   disabled (`withChatAccess` over `replaceRadar`, the toasts of the edit outcomes): on `ok` the editor closes
 *   (`back()`) to the radar sheet and the toast shows over it; otherwise it stays with its draft and the toast shows
 *   inside it. A `not_found` answer reloads the list, and the rule above then leaves for the tab. An editor the user
 *   left while the request ran (Back, ×, a drag) is not closed again — the stale `back()` would close the radar sheet
 *   below or step past the page the user went to — and its failure toast shows in the app's host (`useSheetRequest`).
 * - The standalone copy (a direct load) renders only on its own address, `/radars/<id>/edit`: Back from it replaces
 *   the address with the radar sheet, which Next intercepts into `@sheet` while the `children` slot keeps this copy
 *   (the standalone radar sheet, whose child it is, also yields to the `@sheet` copy then).
 *
 * Closing without saving drops the draft. While radars are switched off (DEC-51) it renders nothing and gives way to
 * the tab.
 */
export function RadarEditSheet({ params, presentation, flags = devFlags }: RadarEditSheetProps) {
  const { id } = use(params);
  const off = useRadarsOffRedirect();
  const matched = matchRoute(usePathname());
  const own = presentation === "layer" || (matched.route === "radar" && matched.edit && sameId(matched.id, id));
  const { radars, status, error, refetch } = useRadars({ previews: true, enabled: own, flags });
  const radar = isRadarId(id) ? radars?.find((item) => sameId(item.id, id)) : undefined;
  const missing = radars !== undefined && radar === undefined;

  useEffect(() => {
    if (missing && !off && own) {
      nav.replace(routes.radars());
    }
  }, [missing, off, own]);

  if (off || !own) {
    return null;
  }
  if (radar === undefined) {
    return <EditorPending presentation={presentation} failed={status === "error" && !missing ? (error?.error ?? "server") : null} onRetry={refetch} />;
  }
  return <RadarEditor radar={radar} presentation={presentation} flags={flags} />;
}

/** The editor's frame before its radar is known: the spinner, or the failed list with «Повторить». */
function EditorPending({ presentation, failed, onRetry }: { presentation: RoutePresentation; failed: string | null; onRetry: () => Promise<void> }) {
  const t = useTranslations();
  const offline = failed === "offline" || failed === "timeout";
  return (
    <RouteSheet presentation={presentation} variant="full" title={t("sheet.editTitle")} closeLabel={t("common.close")}>
      <div data-route="radar/edit" data-layer={presentation === "layer" ? "sheet" : undefined} data-state={failed === null ? "loading" : "error"}>
        {failed === null ? (
          <div className="grid min-h-[160px] place-items-center">
            <Spinner aria-label={t("feed.loading")} />
          </div>
        ) : (
          <ErrorState
            kind={offline ? "offline" : "server"}
            title={offline ? t("error.offline") : t("common.loadFailed")}
            text={offline ? t("error.offlineText") : t("error.serverText")}
            retryLabel={t("error.retry")}
            onRetry={() => void onRetry()}
          />
        )}
      </div>
    </RouteSheet>
  );
}

/**
 * The request a form sheet waits for (WP-30; WP-26's `useListingActions` rule): `start()` at the tap answers `here()`,
 * true while the copy has not been hidden or left since (a layout effect cleanup, `preserving-ui-state.md`) and the
 * address is still the one of the tap (`currentAddress()`), and `settle()`, which gives the button back unless the copy
 * was hidden meanwhile (the cleanup already did, and a later request may be running).
 */
export function useSheetRequest(setSubmitting: (value: boolean) => void): () => { here: () => boolean; settle: () => void } {
  const waiting = useRef<object | null>(null);
  useLayoutEffect(
    () => () => {
      waiting.current = null;
      setSubmitting(false);
    },
    [setSubmitting],
  );
  return () => {
    const ticket = {};
    const at = currentAddress();
    waiting.current = ticket;
    return {
      here: () => waiting.current === ticket && currentAddress() === at,
      settle: () => {
        if (waiting.current === ticket) {
          waiting.current = null;
          setSubmitting(false);
        }
      },
    };
  };
}

function RadarEditor({ radar, presentation, flags }: { radar: Radar; presentation: RoutePresentation; flags: DevFlags }) {
  const { bfcacheId } = useRouter();
  const { back } = useBack();
  const { saveEdit } = useSubscribe({ flags });
  const [submitting, setSubmitting] = useState(false);
  const start = useSheetRequest(setSubmitting);

  const save = (draft: SearchFilters, relaxed: string | null) => {
    if (submitting) {
      return;
    }
    tg.haptic.impact("medium");
    setSubmitting(true);
    const { here, settle } = start();
    void saveEdit(radar.id, draft, relaxed, { scope: () => (here() ? "sheet" : "app") }).then(
      (result) => {
        const stay = here();
        settle();
        if (result.ok && stay) {
          back();
        }
      },
      (failure: unknown) => {
        settle();
        reportError(failure, { kind: "error", where: "saveEdit" });
      },
    );
  };

  return (
    <FiltersForm
      key={`${bfcacheId}:${radar.id}`}
      mode="radar-edit"
      initial={normalizeFilters(radar.filters)}
      presentation={presentation}
      route="radar/edit"
      rules={searchRules(flags)}
      oneVocabulary={flags.dev021OneFlowVocabulary}
      onApply={nothing}
      onSubscribe={nothing}
      onSave={save}
      submitting={submitting}
    />
  );
}
