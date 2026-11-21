"use client";

import { useTranslations } from "next-intl";

/**
 * A claimed owner (WP-83, BR-APP-100; tier `claimed`, stub 100025): «Хозяин — со слов объявления» with «Мы не
 * проверяли — спросите при звонке, нет ли комиссии.», between «Расположение» and «Кто размещает»; no chip.
 */
export function ClaimedOwnerSection() {
  const t = useTranslations();
  return (
    <section data-section="claimed-owner" className="px-[16px] py-[12px]">
      <h2 className="text-[17px] font-bold text-text">{t("owner.claimed")}</h2>
      <p className="mt-[4px] text-[14px] leading-[1.45] text-hint">{t("owner.claimedHint")}</p>
    </section>
  );
}
