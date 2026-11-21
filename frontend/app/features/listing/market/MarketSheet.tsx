"use client";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { cn } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { marketVerdict } from "@/features/feed/verdict";
import { RouteSheet } from "@/features/shell/RouteSheet";
import { brand } from "@/lib/brand";
import { useGraphicsMode } from "@/lib/graphics";
import { useMoney } from "@/lib/money/useMoney";
import { tg } from "@/lib/telegram";

import { SectionSkeleton } from "../ListingSkeleton";
import type { ListingDetails } from "../listingData";
import { markerPosition, marketParagraphs, ownValue, updatedText } from "./marketText";

/**
 * `false` until two frames after `active` turns on, then `true`; back to `false` when the sheet is hidden, so every
 * showing plays the demo scale anew.
 */
function useRevealed(active: boolean): boolean {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      setRevealed(false);
    };
  }, [active]);
  return revealed;
}

/**
 * The demo scale (legacy `minfo`): the dot slides from the centre to the listing's place over 1 s after 0.2 s, and the
 * own price fades in over 0.3 s at 1 s. Transitions after two frames stand in for legacy's keyframes (same timing);
 * lite graphics drop them, reduced motion drops them through `motion.css`.
 */
function DemoScale({ position, label, revealed, motion }: { position: number; label: string | null; revealed: boolean; motion: boolean }) {
  return (
    <div data-market-demo="" aria-hidden className="relative mx-[8px] pt-[30px] pb-[6px]">
      <div className="h-[6px] rounded-pill bg-[linear-gradient(90deg,var(--good),var(--fill)_50%,var(--high))]" />
      <span className="absolute bottom-[3px] left-1/2 h-[12px] w-[2px] -translate-x-1/2 rounded-pill bg-hint" />
      <span
        data-market-demo-dot=""
        className={cn(
          "absolute bottom-[2px] flex -translate-x-1/2 flex-col items-center gap-[4px]",
          motion && "transition-[left] delay-200 duration-1000 ease-(--ease-out)",
        )}
        style={{ left: `${revealed ? position : 50}%` }}
      >
        {label !== null ? (
          <span
            data-market-demo-tag=""
            className={cn(
              "rounded-pill bg-text px-[8px] py-[2px] text-[13px] font-semibold whitespace-nowrap text-bg",
              motion && "transition-opacity delay-1000 duration-300 ease-[ease-out]",
              revealed ? "opacity-100" : "opacity-0",
            )}
          >
            {label}
          </span>
        ) : null}
        <span className="size-[14px] rounded-pill border-2 border-sheet bg-text" />
      </span>
    </div>
  );
}

/**
 * The market sheet «Откуда эта цифра» (WP-26, SCR-022): a compact `RouteSheet` with no ×, closed by the backdrop, a
 * drag or Back. While the listing's answer is pending it shows a section skeleton; with a verdict, a comparison and a
 * delta, the demo scale, then the sample, the median and the own price with its conclusion as separate paragraphs
 * (the own one left out without an own value) and the footer «asking · updated», followed by « · Подробнее» only
 * when the brand layer has a methodology address for the locale. Without a verdict, a comparison or a delta — an
 * address typed by hand, since ⓘ shows only with the block — only the asking line remains (HOMI: legacy renders no
 * sheet). The sheet is portalled, so it has no server HTML; "updated" is measured from when it opened.
 */
export function MarketSheet({ details }: { details: ListingDetails | null }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  const money = useMoney();
  const { lite } = useGraphicsMode();
  const [openedAt] = useState(() => Date.now());

  const verdict = details === null ? null : marketVerdict(details, locale, translate);
  const ctx = { locale, t: translate, money };
  const paragraphs = details === null || verdict === null ? null : marketParagraphs(details, ctx);
  const revealed = useRevealed(paragraphs !== null);
  const asking = t("market.v3.asking");
  const more = brand.links.methodology[locale];

  let body;
  if (details === null) {
    body = <SectionSkeleton lines={4} />;
  } else if (paragraphs === null || details.comparison === null || details.market.median_delta === null) {
    body = (
      <p data-market-footer="" className="text-[13px] leading-snug text-hint">
        {asking}
      </p>
    );
  } else {
    const own = ownValue(details.comparison);
    body = (
      <>
        <DemoScale
          position={markerPosition(details.market.median_delta)}
          label={own === null ? null : money.format(own)}
          revealed={revealed}
          motion={!lite}
        />
        <p data-market-paragraph="sample">{paragraphs.sample}</p>
        <p data-market-paragraph="median">{paragraphs.median}</p>
        {paragraphs.own !== null ? <p data-market-paragraph="own">{paragraphs.own}</p> : null}
        <p data-market-footer="" className="text-[13px] leading-snug text-hint">
          {[asking, updatedText(details.comparison.updated, openedAt, translate)].filter(Boolean).join(" · ")}
          {more !== null ? (
            <>
              {" · "}
              <button
                type="button"
                data-market-more=""
                onClick={() => tg.openLink(more)}
                className="text-accent outline-none focus-visible:underline"
              >
                {t("market.info.more")}
              </button>
            </>
          ) : null}
        </p>
      </>
    );
  }

  return (
    <RouteSheet presentation="layer" variant="compact" title={t("market.how")}>
      <div data-route="listing/market" className="flex flex-col gap-[12px] px-(--gutter) pt-[8px] text-[15px] leading-normal">
        {body}
      </div>
    </RouteSheet>
  );
}
