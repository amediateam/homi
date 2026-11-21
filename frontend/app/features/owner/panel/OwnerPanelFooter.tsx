"use client";

import { useMemo } from "react";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";

import { OwnerActions, useVisibleActions } from "../lists/OwnerActions";
import { useStatusAction } from "../lists/useStatusAction";
import { normalizeOwnerListing, type OwnerListingView } from "../normalize";
import { useOwnerListing } from "../store";
import { FOOTER_FRAME, MineBar, OwnerPanelFooterSkeleton } from "./MineBar";

/**
 * The footer of the user's own listing with its owner panel (WP-82, SCR-059), in place of the contact bar: the
 * panel's actions by status (`actionsOf` with `panel`: «Отклики» with the pending badge, «Изменить», «Пауза» or
 * «Вернуть», «Сдано», «Снять»…). While the owner listing loads, a skeleton of the bar's height; after it failed,
 * `MineBar`. A change confirms where it must, toasts, calls `invalidateOwner()` and re-reads the owner listing in the
 * background without clearing the screen (fix of LB-APP-059); «Изменить» opens the form over the listing (WP-81).
 */
/** A stand-in while the owner listing loads (the hook needs a listing; its actions are not drawn then). */
const EMPTY = normalizeOwnerListing({ id: "-", status: "unknown" }) as OwnerListingView;

export function OwnerPanelFooter({ listingId, number }: { listingId: string; number: number }) {
  const resource = useOwnerListing(listingId);
  const listing = useMemo(() => (resource.data === undefined ? null : normalizeOwnerListing(resource.data)), [resource.data]);
  const { busy, run } = useStatusAction({ onLocked: () => void resource.refetch() });
  const actions = useVisibleActions(listing ?? EMPTY, "panel");

  if (listing === null) {
    // A failed read, or an answer that is not an owner listing: the footer is never empty, nor a skeleton for ever.
    if (resource.error !== null || resource.data !== undefined) {
      return <MineBar />;
    }
    return <OwnerPanelFooterSkeleton />;
  }
  // Nothing to offer (a let listing without requests while the cabinet is off): the footer is never empty (LB-APP-070).
  if (actions.length === 0) {
    return <MineBar />;
  }
  return (
    <div data-cta="" data-owner-footer="" className={FOOTER_FRAME}>
      <div className="mx-auto max-w-[608px] px-[16px] pt-[12px]">
        <OwnerActions
          listing={listing}
          place="panel"
          busy={busy !== null}
          pending={listing.stats?.pending ?? 0}
          onChange={(change) => void run(listing, change)}
          onRequests={() => nav.push(routes.listingRequests(number))}
        />
      </div>
    </div>
  );
}
