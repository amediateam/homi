"use client";

import { useEffect, useState } from "react";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";

import { ownerCtaOf } from "../cta/owner";
import { useListingNumber, useListingRecord } from "../useListing";
import { ContactRequestSheet } from "./ContactRequestSheet";
import { useRequestClosedHere } from "./requestState";

/**
 * `/listing/<number>/contact` in both listing trees (WP-83, SCR-061): only with the full card; a direct load waits for
 * it. The rule is decided once, on the first full card: in any other state than `request` (with `expired`) — the
 * user's own listing, or a number closed in this launch (DEC-85) — the address is replaced by the listing's. After
 * that the sheet's own results (a patch, a re-read) never replace it; closing is the sheet's.
 */
export function ContactRequestRoute({ presentation = "layer" }: { presentation?: "layer" | "standalone" }) {
  const number = useListingNumber();
  const { details } = useListingRecord(number);
  const closedHere = useRequestClosedHere(number);
  const [decision, setDecision] = useState<"open" | "refused" | null>(null);
  if (decision === null && details !== null) {
    const allowed = details.owner?.mine !== true && ownerCtaOf(details, { closedHere })?.action === "request";
    setDecision(allowed ? "open" : "refused");
  }

  useEffect(() => {
    if (decision === "refused" && number !== null) {
      nav.replace(routes.listing(number));
    }
  }, [decision, number]);

  return details !== null && decision === "open" ? <ContactRequestSheet details={details} presentation={presentation} /> : null;
}
