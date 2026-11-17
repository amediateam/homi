"use client";

import dynamic from "next/dynamic";

import { useListingNumber, useListingRecord } from "@/features/listing/useListing";
import { devFlags } from "@/lib/flags";
import { useBack } from "@/lib/navigation/useBack";
import { useCloseOnce } from "@/lib/navigation/useCloseOnce";
import { useLayerState } from "@/lib/navigation/useLayerState";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import type { ActionsStep } from "./ListingActionsSheet";
import { useListingActions } from "./useListingActions";

/** Loaded when the sheet opens (`lazy-loading.md`); portalled, so there is nothing to render on the server. */
const ListingActionsSheet = dynamic(() => import("./ListingActionsSheet").then((module) => module.ListingActionsSheet), { ssr: false });

/** `step=report` and `step=detail` are their steps; no step, or any other value, is the menu. */
function stepOf(value: string | null): ActionsStep {
  return value === "report" || value === "detail" ? value : "menu";
}

function ActionsSheet({ number }: { number: number }) {
  const layer = useLayerState("step");
  const { back } = useBack();
  // Its own guard, apart from the sheet's ×: a double tap on the chevron would walk report → menu → listing.
  const stepBack = useCloseOnce(back);
  const { supportUsername } = useReference();
  const { details, preview } = useListingRecord(number);
  const author = details?.author ?? null;
  const actions = useListingActions({ number, author, flags: devFlags });

  const openStep = (next: "report" | "detail") => {
    // `pushState` moves the address at once and `useSearchParams` follows in a transition: a second tap in between
    // would push the step twice (WP-25 review P-3).
    if (actions.busy || new URLSearchParams(window.location.search).get("step") === next) {
      return;
    }
    tg.haptic.impact("light");
    layer.open(next);
  };

  return (
    <ListingActionsSheet
      step={stepOf(layer.value)}
      author={author}
      isOwner={(details ?? preview)?.is_owner ?? null}
      supportUsername={supportUsername}
      actions={actions}
      onOpenStep={openStep}
      onBack={stepBack}
      agentReview={devFlags.dev010RealtorVoteWording}
    />
  );
}

/**
 * `/listing/{number}/actions` (SCR-023, WP-26) in both trees: the actions sheet over the listing of this layer
 * (`useListingNumber`), the one reader of the `DEV` flags of the sheet. The steps are the layer parameter
 * `step` (`report`, `detail`), so Back walks detail → report → menu → listing. The author and `is_owner` come from
 * the listing's resource, which this route never reads itself: until the details are there the menu shows the
 * generic block hint.
 */
export function ListingActionsRoute() {
  const number = useListingNumber();
  return number === null ? null : <ActionsSheet key={number} number={number} />;
}
