"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";

import { closeActions, closeListing } from "@/features/listing/closeListing";
import type { ListingAuthor, ReportDetail } from "@/features/listing/listingData";
import { blockAuthor, hideListing, unblockAuthor, unhideListing } from "@/lib/actions/hidden";
import { reportListing } from "@/lib/actions/reports";
import { useAction } from "@/lib/actions/useAction";
import type { ApiResult } from "@/lib/api/types";
import { hide as hideNumbers, unhide as unhideNumbers } from "@/lib/data/sessionMaps";
import { supportUrl } from "@/lib/deeplinks/build";
import type { DevFlags } from "@/lib/flags";
import { tg } from "@/lib/telegram";
import { showToast, type ToastMessage } from "@/lib/ui/toast";

export interface UseListingActionsOptions {
  /** The listing the sheet was opened for; a result always applies to the number its action started with. */
  number: number;
  /** The listing's author (details only); its label stands in when the block answer carries none. */
  author: ListingAuthor | null;
  /** `dev051RentedUndo`, `dev010RealtorVoteWording`; from the route (`withDevFlags` in tests). */
  flags: DevFlags;
}

export interface ListingActions {
  /** A request runs, or the sheet is closing after one: every row ignores taps. */
  busy: boolean;
  hide(): void;
  block(): void;
  report(reason: "rented" | "agent" | "fraud"): void;
  reportDetail(detail: ReportDetail): void;
  /** «Написать в поддержку»: the support chat with the listing's start parameter, then the sheet closes. */
  support(username: string): void;
  /** ×, the backdrop and the drag, from any step: the sheet closes with all its steps. */
  close(): void;
}

/**
 * The step the address shows now. Read when the sheet closes, not from the router: `useLayerState` pushes a step with
 * `history.pushState`, and `useSearchParams` follows only in a transition, so a step opened a moment ago would be
 * missed and `backBy` would stop one entry short (the double push of WP-25 review P-3).
 */
function stepInAddress(): string | null {
  return new URLSearchParams(window.location.search).get("step");
}

/**
 * The results of the actions sheet (SCR-023, BR-APP-036, BR-APP-037; the table of WP-26 "Actions sheet").
 *
 * - Every action: ignored while another runs or the sheet closes; the light haptic at its start; on success the
 *   success haptic, on failure the error haptic and «Не получилось сохранить» in the sheet's own toast host — always,
 *   whatever `dev016ErrorToastOnFailure` says (D-6, legacy `03`:1014); nothing changes and the sheet stays.
 * - Hide, block, `rented` and a `fraud` report that hid the listing put the numbers into the `hidden` session map
 *   and close the sheet and the listing together (`closeListing`); the other reports close the sheet only
 *   (`closeActions`). The success toast goes to the app's host, which stays when the sheet's host leaves with it.
 * - «Вернуть» takes the numbers out of `hidden` at once and asks the server; a failed undo hides them again, with the
 *   error haptic and «Не получилось сохранить».
 * - A sheet that was closed or left while its request ran (×, Telegram's Back) is not navigated again: the result
 *   still applies to its listing and shows its toast in the app's host.
 */
export function useListingActions({ number, author, flags }: UseListingActionsOptions): ListingActions {
  const t = useTranslations();
  const hideAction = useAction(hideListing);
  const unhideAction = useAction(unhideListing);
  const blockAction = useAction(blockAuthor);
  const unblockAction = useAction(unblockAuthor);
  const reportAction = useAction(reportListing);
  const [busy, setBusy] = useState(false);
  /** The request in flight (its id), and whether the sheet is on its way out. */
  const sending = useRef<number | null>(null);
  const closing = useRef(false);
  const lastId = useRef(0);

  // Hidden with its cached route, or left: a result still on its way no longer moves the address, and the next
  // showing starts idle.
  useLayoutEffect(
    () => () => {
      sending.current = null;
      closing.current = false;
      setBusy(false);
    },
    [],
  );

  const leave = (here: boolean, what: "listing" | "sheet", n: number) => {
    if (here) {
      void (what === "listing" ? closeListing(stepInAddress()) : closeActions(n, stepInAddress()));
    }
  };

  const undoToast = (text: string, numbers: readonly number[], revert: () => Promise<ApiResult<unknown>>): ToastMessage => ({
    text,
    action: t("toast.undo"),
    run: () => {
      unhideNumbers(numbers);
      return revert().then((result) => {
        if (!result.ok) {
          hideNumbers(numbers);
          tg.haptic.error();
          showToast({ key: "common.saveFailed" });
        }
      });
    },
  });

  const send = <T>(request: (n: number) => Promise<ApiResult<T>>, succeed: (data: T, n: number, here: boolean) => void) => {
    if (sending.current !== null || closing.current) {
      return;
    }
    const id = ++lastId.current;
    const n = number;
    sending.current = id;
    setBusy(true);
    tg.haptic.impact("light");
    const finish = (result: ApiResult<T> | null) => {
      const here = sending.current === id;
      if (here) {
        sending.current = null;
      }
      if (result === null || !result.ok) {
        tg.haptic.error();
        if (here) {
          setBusy(false);
        }
        showToast({ key: "common.saveFailed" }, here ? "sheet" : "app");
        return;
      }
      tg.haptic.success();
      if (here) {
        closing.current = true;
      }
      succeed(result.data, n, here);
    };
    void request(n).then(finish, () => finish(null));
  };

  return {
    busy,
    hide: () =>
      send(
        (n) => hideAction({ number: n }),
        (_, n, here) => {
          hideNumbers([n]);
          leave(here, "listing", n);
          showToast(undoToast(t("toast.hidden"), [n], () => unhideAction({ number: n })));
        },
      ),
    block: () =>
      send(
        (n) => blockAction({ number: n }),
        (data, n, here) => {
          const numbers = [...new Set([n, ...data.listing_numbers])];
          hideNumbers(numbers);
          leave(here, "listing", n);
          const label = data.label || author?.label || "";
          showToast(undoToast(t("toast.blocked", { label }), numbers, () => unblockAction({ number: n })));
        },
      ),
    report: (reason) =>
      send(
        (n) => reportAction({ number: n, reason }),
        (data, n, here) => {
          if (reason === "rented" || (reason === "fraud" && data.hidden)) {
            hideNumbers([n]);
            leave(here, "listing", n);
            const unhide = () => unhideAction({ number: n });
            if (reason === "fraud") {
              showToast(undoToast(t("toast.reportedFraud"), [n], unhide));
            } else {
              showToast(flags.dev051RentedUndo ? undoToast(t("toast.reportedRented"), [n], unhide) : { key: "toast.reportedRented" });
            }
            return;
          }
          leave(here, "sheet", n);
          if (reason === "agent") {
            showToast({ key: flags.dev010RealtorVoteWording ? "toast.reportedAgentReview" : "toast.reportedAgent" });
          } else {
            showToast({ key: "toast.reported" });
          }
        },
      ),
    reportDetail: (detail) =>
      send(
        (n) => reportAction({ number: n, reason: "wrong_data", detail }),
        (_, n, here) => {
          leave(here, "sheet", n);
          showToast({ key: "toast.reported" });
        },
      ),
    support: (username) => {
      const url = supportUrl(username, number);
      if (url === null || sending.current !== null || closing.current) {
        return;
      }
      closing.current = true;
      setBusy(true);
      tg.haptic.impact("light");
      tg.openLink(url);
      void closeActions(number, stepInAddress());
    },
    close: () => {
      if (closing.current) {
        return;
      }
      // A request still on its way applies its result without moving the address again.
      closing.current = true;
      sending.current = null;
      void closeActions(number, stepInAddress());
    },
  };
}
