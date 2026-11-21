"use client";

import { Phone } from "@homi/ui";
import { useTranslations } from "next-intl";

import { ageText } from "@/features/feed/cardText";

import type { ListingDetails, ListingOffer } from "../listingData";
import { openOriginal } from "../openOriginal";
import type { PhoneControl } from "./controls";

const LINK = "text-left font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * «Кто размещает» (`03` SCR-018, block 10): who posts, the offers (one with a link opens it, with no haptic, as
 * legacy), the phone and «Опубликовано {when}». No digit is shown before a tap (DEC-52): while the listing has a
 * phone the row is «Показать номер», and once the contact gave a number it is that number, which calls. The
 * contact work is the caller's (`phone`, `null` without a phone); this section only renders it.
 */
export function AuthorSection({
  number,
  ownerLabel,
  offers,
  posted,
  phone,
}: {
  number: number;
  ownerLabel: string | null;
  offers: readonly ListingOffer[];
  posted: ListingDetails["posted"];
  phone: PhoneControl | null;
}) {
  const t = useTranslations();
  const when = ageText({ posted });
  if (!ownerLabel && offers.length === 0 && phone === null && when === null) {
    return null;
  }

  return (
    <section data-section="author" className="flex flex-col gap-[8px] px-(--gutter) py-[12px]">
      <h2 className="text-[17px] font-bold">{t("listing.whoPosts")}</h2>
      {ownerLabel ? <p className="font-semibold">{ownerLabel}</p> : null}
      {offers.length > 0 ? (
        <ul className="flex flex-col gap-[4px]">
          {offers.map((offer, index) =>
            offer.url === null ? (
              <li key={`${offer.text}:${index}`} data-offer="">
                {offer.text}
              </li>
            ) : (
              <li key={`${offer.text}:${index}`}>
                <button type="button" data-offer="" onClick={() => openOriginal(number, offer.url, "offers")} className={LINK}>
                  {offer.text}
                </button>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {phone !== null ? (
        phone.display === null ? (
          <button
            type="button"
            data-phone="reveal"
            onClick={() => phone.onReveal("author")}
            className="inline-flex items-center gap-[8px] self-start rounded-pill bg-fill px-[14px] py-[8px] font-semibold text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Phone size={17} strokeWidth={2} aria-hidden />
            {t("listing.showPhone")}
          </button>
        ) : (
          <button
            type="button"
            data-phone="number"
            onClick={() => phone.onCall("author")}
            className="ph-mask ph-no-capture inline-flex items-center gap-[8px] self-start rounded-pill bg-fill px-[14px] py-[8px] font-semibold text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Phone size={17} strokeWidth={2} aria-hidden />
            {phone.display}
          </button>
        )
      ) : null}
      {when !== null ? (
        <p data-published="" className="text-[13px] text-hint">
          {t("listing.published", { when })}
        </p>
      ) : null}
    </section>
  );
}
