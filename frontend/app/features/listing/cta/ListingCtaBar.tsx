"use client";

import type { Locale } from "@homi/config";
import type { MessageKey } from "@homi/i18n";
import type { Translate } from "@homi/i18n/format";
import { Button, cn, type LucideIcon, MessageCircle, Phone, Send, Skeleton } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";

import { marketChipText, marketVerdict, type VerdictTone } from "@/features/feed/verdict";

import type { ListingDetails, ListingPreview } from "../listingData";
import type { ListingContactView } from "./useContact";

/** The right side of the bar (BR-APP-032): the shimmer while the answer is pending, a button, or nothing. */
export type CtaAction = "pending" | "call" | "write" | "writePaid" | "openPost" | "none";

type ButtonAction = Exclude<CtaAction, "pending" | "none">;

/** «Номер платный» has no icon (legacy). */
const BUTTONS: Record<ButtonAction, { label: MessageKey; Icon: LucideIcon | null; run: keyof ListingContactView["cta"] }> = {
  call: { label: "listing.call", Icon: Phone, run: "onCall" },
  write: { label: "listing.write", Icon: MessageCircle, run: "onWrite" },
  writePaid: { label: "listing.writePaid", Icon: null, run: "onWrite" },
  openPost: { label: "listing.openPost", Icon: Send, run: "onOpenPost" },
};

/** The verdict's text colour under the price; an unknown tone reads neutral (LB-APP-039). */
const TONE: Record<VerdictTone, string> = {
  good: "text-badge-good",
  high: "text-badge-high",
  suspicious: "text-badge-warn",
  check: "text-badge-warn",
  same: "text-badge-same",
  mixed: "text-badge-same",
  no_repair: "text-badge-same",
  neutral: "text-badge-same",
};

const SEPARATOR = " · ";

/**
 * The primary action by priority (BR-APP-032): pending without the details; a phone → «Позвонить»; a contact link →
 * «Написать», or «Номер платный» when it is paid; a deleted post or one without an address → none (D-23); else
 * «Открыть пост».
 */
export function ctaActionOf(details: ListingDetails | null): CtaAction {
  if (details === null) {
    return "pending";
  }
  if (details.contact.has_phone) {
    return "call";
  }
  if (details.contact.contact_url) {
    return details.contact.contact_paid ? "writePaid" : "write";
  }
  if (details.original.deleted || details.original.url === null) {
    return "none";
  }
  return "openPost";
}

/**
 * The bar fixed to the bottom of the listing layer (`03` SCR-018, block 14). Left: the price's main part and period
 * as the contract splits them, or «Договорная»; under it the verdict's short label and the price notes when there
 * are notes, else the market chip («{delta} к рынку», «≈ обычная», «≈ спорно»). No price-kind label and no `alt`
 * (D-25). Right: the action of `ctaActionOf`; without one the cell stays empty at the same width. The taps, their
 * haptics and their events are `useListingContact`'s.
 */
export function ListingCtaBar({
  item,
  details,
  cta,
}: {
  item: Pick<ListingPreview, "price" | "market">;
  details: ListingDetails | null;
  cta: ListingContactView["cta"];
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  const verdict = marketVerdict(item, locale, translate);
  const notes = item.price?.notes.join(SEPARATOR) ?? "";
  const lead = notes ? (verdict?.short ?? null) : verdict ? marketChipText(verdict, translate) : null;
  const action = ctaActionOf(details);
  const primary = action === "pending" || action === "none" ? null : BUTTONS[action];

  return (
    <div
      data-cta=""
      className="fixed inset-x-0 bottom-0 z-(--z-cta) border-t border-sep bg-bg pb-[calc(12px+var(--bottom-inset))]"
    >
      <div className="mx-auto flex max-w-[608px] items-center gap-[12px] px-[16px] pt-[12px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p data-cta-price="" className="truncate text-[15px] text-hint">
            {item.price === null ? (
              <b className="text-[20px] font-bold tracking-[-0.03em] text-text">{t("listing.negotiable")}</b>
            ) : (
              <>
                <b className="text-[22px] leading-[1.1] font-bold tracking-[-0.04em] text-text">{item.price.display}</b>
                {item.price.period ? <span>{item.price.period}</span> : null}
              </>
            )}
          </p>
          {lead || notes ? (
            <p data-cta-note="" className="truncate text-[13px] text-hint">
              {lead && verdict ? (
                <span data-tone={verdict.tone} className={cn("font-semibold", TONE[verdict.tone])}>
                  {lead}
                </span>
              ) : null}
              {lead && notes ? SEPARATOR : null}
              {notes || null}
            </p>
          ) : null}
        </div>
        {action === "pending" ? (
          <div data-cta-action="pending" className="ml-auto w-[45%] flex-none">
            <Skeleton className="h-[48px] w-full rounded-large" />
          </div>
        ) : primary === null ? (
          <div data-cta-action="none" aria-hidden className="ml-auto w-[45%] flex-none" />
        ) : (
          <Button
            data-cta-action={action}
            onClick={cta[primary.run]}
            className="ml-auto h-[48px] w-[45%] flex-none gap-[8px] px-[16px] text-[16px]"
          >
            {primary.Icon ? <primary.Icon size={18} strokeWidth={2} aria-hidden /> : null}
            <span className="truncate">{t(primary.label)}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
