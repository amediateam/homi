"use client";

import { useTranslations } from "next-intl";

/**
 * «Из объявления» (`03` SCR-018, block 11): the server's summary as text, its line breaks kept; no summary → no
 * section. The server masked its phone numbers (DEC-52).
 */
export function DescriptionSection({ summary, ownerText = null }: { summary: string | null; ownerText?: string | null }) {
  const t = useTranslations();
  // A self-placed listing (WP-83): the owner's own words, masked by the server (DEC-52), as a second paragraph.
  const own = ownerText?.trim() ? ownerText : null;
  if (!summary?.trim() && own === null) {
    return null;
  }
  return (
    <section data-section="description" className="flex flex-col gap-[8px] px-(--gutter) py-[12px]">
      <h2 className="text-[17px] font-bold">{t("listing.description")}</h2>
      {summary?.trim() ? <p className="leading-normal break-words whitespace-pre-line">{summary}</p> : null}
      {own === null ? null : (
        <p data-owner-description="" className="leading-normal break-words whitespace-pre-line">
          {own}
        </p>
      )}
    </section>
  );
}
