"use client";

import { useTranslations } from "next-intl";

/**
 * «Из объявления» (`03` SCR-018, block 11): the server's summary as text, its line breaks kept; no summary → no
 * section. The server masked its phone numbers (DEC-52).
 */
export function DescriptionSection({ summary }: { summary: string | null }) {
  const t = useTranslations();
  if (!summary?.trim()) {
    return null;
  }
  return (
    <section data-section="description" className="flex flex-col gap-[8px] px-(--gutter) py-[12px]">
      <h2 className="text-[17px] font-bold">{t("listing.description")}</h2>
      <p className="leading-normal break-words whitespace-pre-line">{summary}</p>
    </section>
  );
}
