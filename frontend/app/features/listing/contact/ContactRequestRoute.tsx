"use client";

import { useEffect } from "react";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";

import { ownerCtaOf } from "../cta/owner";
import { useListingNumber, useListingRecord } from "../useListing";
import { ContactRequestSheet } from "./ContactRequestSheet";

/**
 * `/listing/<number>/contact` in both listing trees (WP-83, SCR-061): only with the full card; a direct load waits for
 * it. In any other state than `request` (with `expired`) — the user's own listing included — the address is replaced
 * by the listing's.
 */
export function ContactRequestRoute({ presentation = "layer" }: { presentation?: "layer" | "standalone" }) {
  const number = useListingNumber();
  const { details } = useListingRecord(number);
  const allowed = details !== null && details.owner?.mine !== true && ownerCtaOf(details)?.action === "request";

  useEffect(() => {
    if (details !== null && !allowed && number !== null) {
      nav.replace(routes.listing(number));
    }
  }, [allowed, details, number]);

  return details !== null && allowed ? <ContactRequestSheet details={details} presentation={presentation} /> : null;
}
