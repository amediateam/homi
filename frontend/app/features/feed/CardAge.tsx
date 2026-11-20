"use client";

import type { Translate } from "@homi/i18n/format";
import { useTranslations } from "next-intl";

import { ageLabel } from "./cardText";
import { clockNow, useMinute } from "./minuteClock";
import type { ListingPreview } from "./types";

/**
 * The age of a listing (`ageLabel`): the server's string until the client knows its clock, then the computed label.
 * `live` follows the minute clock; without it the label is computed when the caller renders (the radar strip).
 */
export function useAgeLabel(item: Pick<ListingPreview, "posted">, live: boolean): string | null {
  const t = useTranslations();
  const minute = useMinute(live);
  const translate: Translate = (key, values) => t(key as never, values as never);
  return ageLabel(item, minute === null ? null : clockNow(), translate);
}

/**
 * The card's age (legacy `ListingAge`): its own small leaf, so a new minute re-renders the label and not the memoised
 * card around it.
 */
export function CardAge({ item }: { item: Pick<ListingPreview, "posted"> }) {
  const age = useAgeLabel(item, true);
  return age ? (
    <span data-age="" className="flex-none text-[13px] font-normal text-hint">
      {age}
    </span>
  ) : null;
}
