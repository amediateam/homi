"use client";

import { ChevronRight } from "@homi/ui";
import { useTranslations } from "next-intl";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

/** The frame of the listing's bottom bar (the contact bar's, WP-26), so the footer swap keeps its height. */
export const FOOTER_FRAME = "fixed inset-x-0 bottom-0 z-(--z-cta) border-t border-sep bg-bg pb-[calc(12px+var(--bottom-inset))]";

/**
 * The footer of the user's own listing without its owner panel (WP-82, SCR-059, fix of LB-APP-070): «Это ваше
 * объявление» with «Отклики — в «Мои объявления»»; a tap opens «Мои объявления». The footer is never empty.
 */
export function MineBar() {
  const t = useTranslations();
  return (
    <div data-cta="" data-mine-bar="" className={FOOTER_FRAME}>
      <button
        type="button"
        onClick={() => {
          tg.haptic.impact("light");
          nav.push(routes.ownerListings());
        }}
        className="mx-auto flex w-full max-w-[608px] items-center gap-[12px] px-[16px] pt-[12px] text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="text-[16px] font-semibold text-text">{t("contact.mineBar")}</span>
          <span className="truncate text-[13px] text-hint">{t("contact.mineBarHint")}</span>
        </span>
        <ChevronRight size={18} aria-hidden className="flex-none text-hint" />
      </button>
    </div>
  );
}
