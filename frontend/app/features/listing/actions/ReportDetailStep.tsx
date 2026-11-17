"use client";

import type { MessageKey } from "@homi/i18n";
import { useTranslations } from "next-intl";

import type { ReportDetail } from "@/features/listing/listingData";

import { ActionRow } from "./ActionRow";

/** The detail codes of a `wrong_data` report, in the order of the step (SCR-023, F-REPORT-001). */
export const REPORT_DETAILS = ["price", "rooms", "place", "photos", "other"] as const satisfies readonly ReportDetail[];

const TEXTS: Readonly<Record<ReportDetail, { title: MessageKey; hint: MessageKey }>> = {
  price: { title: "report.d_price", hint: "report.d_priceHint" },
  rooms: { title: "report.d_rooms", hint: "report.d_roomsHint" },
  place: { title: "report.d_place", hint: "report.d_placeHint" },
  photos: { title: "report.d_photos", hint: "report.d_photosHint" },
  other: { title: "report.d_other", hint: "report.d_otherHint" },
};

/**
 * «Что именно неверно?» (since legacy `index-BNLZFfL0.js`): five rows without icons or arrows; a tap sends the report
 * at once — no text field, no confirm button.
 */
export function ReportDetailStep({ disabled, onDetail }: { disabled: boolean; onDetail: (detail: ReportDetail) => void }) {
  const t = useTranslations();
  return (
    <>
      {REPORT_DETAILS.map((code) => (
        <ActionRow
          key={code}
          action={code}
          title={t(TEXTS[code].title)}
          hint={t(TEXTS[code].hint)}
          disabled={disabled}
          onSelect={() => onDetail(code)}
        />
      ))}
    </>
  );
}
