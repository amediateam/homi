"use client";

import { ChevronDown, cn } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";

import { tg } from "@/lib/telegram";

import type { ListingSourceLink } from "../listingData";
import { openOriginal } from "../openOriginal";

/**
 * «Источник» (`03` SCR-018, block 12): a chip per channel the listing was posted in, which opens its post, then the
 * disclosure «Текст оригинала» when the post has a text; its body (`children`, the `OriginalText`) shows only while
 * it is open and expands in place. The disclosure is closed for every new number, also when the screen stays
 * mounted. The chip row scrolls sideways, so a swipe on it never closes the listing. Every tap plays the light
 * haptic. No chip and no text → no section.
 */
export function SourcesSection({
  number,
  sources,
  originalText,
  children,
}: {
  number: number;
  sources: readonly ListingSourceLink[];
  originalText: string | null;
  children?: ReactNode;
}) {
  const t = useTranslations();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [openedNumber, setOpenedNumber] = useState(number);
  if (openedNumber !== number) {
    setOpenedNumber(number);
    setOpen(false);
  }
  const hasText = Boolean(originalText?.trim());
  if (sources.length === 0 && !hasText) {
    return null;
  }

  return (
    <section data-section="sources" className="flex flex-col gap-[10px] px-(--gutter) py-[12px]">
      <h2 className="text-[17px] font-bold">{t("listing.source")}</h2>
      {sources.length > 0 ? (
        <div
          data-scroll-x=""
          data-no-swipe=""
          className="-mx-(--gutter) flex gap-[8px] overflow-x-auto overscroll-x-contain px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sources.map((source) => (
            <button
              key={source.url}
              type="button"
              data-source-chip=""
              onClick={() => {
                tg.haptic.impact("light");
                openOriginal(number, source.url, "sources");
              }}
              className="flex-none rounded-pill bg-fill px-[12px] py-[7px] text-[14px] font-medium whitespace-nowrap text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              @{source.handle}
            </button>
          ))}
        </div>
      ) : null}
      {hasText ? (
        <div className="flex flex-col gap-[8px]">
          <button
            type="button"
            data-original-toggle=""
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
            onClick={() => {
              tg.haptic.impact("light");
              setOpen(!open);
            }}
            className="flex items-center gap-[6px] self-start font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("listing.originalText")}
            <ChevronDown size={17} strokeWidth={2} aria-hidden className={cn(open && "rotate-180")} />
          </button>
          {open ? (
            <div id={bodyId} data-original="">
              {children}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
