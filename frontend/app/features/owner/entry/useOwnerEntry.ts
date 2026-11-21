"use client";

import { useCallback, useRef } from "react";

import { track } from "@/lib/analytics/events";
import { bffFetch } from "@/lib/api/browser";
import { seedResource } from "@/lib/data/useResource";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { openSettingsThen } from "../closeOwnerForm";
import { OWNER_LISTINGS_KEY, type OwnerListingsBody } from "../store";

export type EntrySource = "feed_end" | "empty" | "listing";

/** How long a tap's opening holds after its navigation (a second tap meanwhile does nothing). */
export const OPENING_MS = 800;

/**
 * A tap on an invitation into the cabinet (WP-82, BR-APP-115, F-OWNER-010): a light haptic, `owner_entry {src}`, then
 * the owner list read through the store — `can_add` opens a new form; a full account presses the Settings tab and
 * opens «Мои объявления», as the tab tip does (DEV-059); an error opens a new form, whose own limit state answers a
 * full account. One opening at a time: a tap while the read runs does nothing and sends no event (fix of LB-APP-084).
 */
export function useOwnerEntry(): (src: EntrySource) => Promise<void> {
  const opening = useRef(false);
  return useCallback(async (src: EntrySource) => {
    if (opening.current) {
      return;
    }
    opening.current = true;
    tg.haptic.impact("light");
    track("owner_entry", { src });
    try {
      const list = await bffFetch<OwnerListingsBody | null>("owner/listings");
      const body = list.ok ? list.data : null;
      if (body !== null && typeof body === "object") {
        seedResource(OWNER_LISTINGS_KEY, body);
      }
      if (body === null || body.can_add !== false) {
        nav.push(routes.ownerNew());
        return;
      }
      await openSettingsThen(routes.ownerListings());
    } finally {
      // The opening lasts until the pushed address has had time to show: a tap right after it opens nothing twice.
      setTimeout(() => {
        opening.current = false;
      }, OPENING_MS);
    }
  }, []);
}
