"use client";

import type { MessageKey } from "@homi/i18n";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import { deleteOwnerListing, setOwnerStatus, type OwnerStatusChange } from "@/lib/actions/owner";
import { useAction } from "@/lib/actions/useAction";
import type { ApiFailure } from "@/lib/api/errors";
import { confirmText } from "@/lib/ui/confirm";
import { showToast } from "@/lib/ui/toast";
import { tg } from "@/lib/telegram";

import type { OwnerListingView } from "../normalize";
import { invalidateOwner, type OwnerListingBody, putOwnerListing } from "../store";

/** The changes of a listing's status and its deletion (BR-APP-088): what the card's and the panel's buttons send. */
export type StatusChange = "pause" | "resume" | "rented" | "remove" | "delete";

const STATUS: Record<Exclude<StatusChange, "delete">, OwnerStatusChange> = { pause: "paused", resume: "active", rented: "rented", remove: "removed" };

const TOAST: Record<StatusChange, MessageKey> = {
  pause: "own.toast.paused",
  resume: "own.toast.active",
  rented: "own.toast.rented",
  remove: "own.toast.removed",
  delete: "own.toast.draftRemoved",
};

/** The confirmation of a change, or `null` for one that needs none («Пауза», «Вернуть»). */
function confirmationOf(change: StatusChange, listing: OwnerListingView): MessageKey | null {
  switch (change) {
    case "rented":
      return "own.confirmRented";
    case "remove":
      return "own.confirmRemove";
    case "delete":
      return listing.status === "rejected" ? "own.confirmDeleteRejected" : "own.confirmDeleteDraft";
    default:
      return null;
  }
}

export interface StatusActionDone {
  /** The listing as the server answered it, or `null` once deleted. */
  listing: OwnerListingBody | null;
  id: string;
}

/**
 * One status change at a time (WP-82, BR-APP-088): «Сдано», «Снять» and «Удалить» confirm first; success gives the
 * success haptic and the toast, writes the answer into the store (`onDone` lets the list drop or replace the card),
 * then `invalidateOwner()`; failure gives the error haptic and «Не получилось — проверьте интернет…» or «Не получилось
 * сохранить», `409 owner_listing_locked` reads the list again (`onLocked`), `403 owner_disabled` (a resume while the
 * cabinet is off) says so. Nothing leads out of `rented` or `removed` (default 20).
 */
export function useStatusAction(options: { onDone?: (done: StatusActionDone) => void; onLocked?: () => void } = {}) {
  const t = useTranslations();
  const setStatus = useAction(setOwnerStatus);
  const remove = useAction(deleteOwnerListing);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const { onDone, onLocked } = options;

  const fail = useCallback(
    (failure: ApiFailure) => {
      tg.haptic.error();
      if (failure.code === "owner_listing_locked") {
        onLocked?.();
      }
      if (failure.code === "owner_disabled") {
        showToast({ key: "own.disabled" });
        return;
      }
      showToast({ key: failure.error === "offline" || failure.error === "timeout" ? "own.actionOffline" : "common.saveFailed" });
    },
    [onLocked],
  );

  const run = useCallback(
    async (listing: OwnerListingView, change: StatusChange) => {
      if (running.current) {
        return;
      }
      const question = confirmationOf(change, listing);
      if (question !== null && !(await confirmText(t(question)))) {
        return;
      }
      running.current = true;
      setBusy(listing.id);
      try {
        if (change === "delete") {
          const result = await remove({ id: listing.id });
          if (!result.ok) {
            fail(result);
            return;
          }
          tg.haptic.success();
          showToast({ key: listing.status === "rejected" ? "own.toast.deleted" : TOAST.delete });
          onDone?.({ listing: null, id: listing.id });
        } else {
          const result = await setStatus({ id: listing.id, status: STATUS[change] });
          if (!result.ok) {
            fail(result);
            return;
          }
          tg.haptic.success();
          showToast({ key: TOAST[change] });
          putOwnerListing(result.data);
          onDone?.({ listing: result.data, id: listing.id });
        }
        invalidateOwner();
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [fail, onDone, remove, setStatus, t],
  );

  return { busy, run };
}
