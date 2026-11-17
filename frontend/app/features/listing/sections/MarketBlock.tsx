"use client";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { cn, Info } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { Verdict, VerdictTone } from "@/features/feed/verdict";
import { useRouter } from "@/i18n/navigation";
import { useGraphicsMode } from "@/lib/graphics";
import { useMoney } from "@/lib/money/useMoney";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import type { ListingDetails } from "../listingData";
import { contextLine, markerPosition, marketTitleKey, ownValue, showsMarket, unitKey } from "../market/marketText";

/** The numbers whose marker already ran from the centre in this launch. */
const markerShown = new Set<number>();

/** Forgets which markers ran; tests only. */
export function resetMarkerShows(): void {
  markerShown.clear();
}

/** The verdict's colour (`03` §3.6 verdict tones, as the card's chip); an unknown tone is neutral (LB-APP-039). */
const VERDICT_TONE: Record<VerdictTone, string> = {
  good: "text-badge-good",
  high: "text-badge-high",
  suspicious: "text-badge-warn",
  check: "text-badge-warn",
  same: "text-badge-same",
  mixed: "text-badge-same",
  no_repair: "text-badge-same",
  neutral: "text-badge-same",
};

/**
 * The market block (WP-26, BR-APP-028, block 5): shown when `verdict.ts` gives a verdict, the comparison is there and
 * the delta is known (D-4) — the loaded state only. The title by scope, ⓘ (light haptic) to the market sheet, the
 * verdict in its tone, the scale «дешевле · обычно {value}{unit} · дороже» with the listing's own price as a marker at
 * `markerPosition(delta)` (none without an own value: never «$NaN»), the context line, and the warning of a
 * `suspicious` tone or the server's note of a `check` tone.
 *
 * Motion (legacy values): the first show of a number in this launch starts the marker at the centre and moves it
 * after two frames (0.7 s), while the verdict fades in after 0.45 s; later shows start in place. "First" is the first
 * render that has a median (HOMI: legacy counted its first mount, the preview, so its marker never ran on the card →
 * listing path). Lite graphics drop both transitions; reduced motion drops them through `motion.css`.
 */
export function MarketBlock({ number, details, verdict }: { number: number; details: ListingDetails; verdict: Verdict | null }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  const money = useMoney();
  const router = useRouter();
  const { lite } = useGraphicsMode();
  const visible = showsMarket(details, verdict !== null);
  const [revealed, setRevealed] = useState(() => markerShown.has(number));

  useEffect(() => {
    if (!visible || revealed) {
      return undefined;
    }
    markerShown.add(number);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [visible, revealed, number]);

  const comparison = details.comparison;
  const delta = details.market.median_delta;
  if (!visible || verdict === null || comparison === null || delta === null) {
    return null;
  }
  const own = ownValue(comparison);
  const context = contextLine(details, { locale, t: translate, money });
  const tone = details.market.tone;
  const note = tone === "suspicious" ? t("market.noteSuspicious") : tone === "check" && comparison.note ? comparison.note : null;

  return (
    <section data-section="market" className="flex flex-col gap-[10px] px-(--gutter) py-[12px]">
      <div className="flex items-center gap-[8px]">
        <h2 className="min-w-0 flex-1 text-[17px] font-bold">{t(marketTitleKey(comparison.scope))}</h2>
        <button
          type="button"
          data-action="market-info"
          aria-label={t("market.how")}
          onClick={() => {
            tg.haptic.impact("light");
            router.push(routes.listingMarket(number));
          }}
          className="-mr-[6px] grid size-[32px] flex-none place-items-center rounded-pill text-hint outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <p
        data-market-verdict=""
        data-tone={verdict.tone}
        className={cn(
          "text-[15px] leading-snug font-semibold",
          VERDICT_TONE[verdict.tone],
          !lite && "transition-[opacity,transform] delay-450 duration-300",
          revealed ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0",
        )}
      >
        {verdict.text}
      </p>
      <div data-market-scale="" className="relative pt-[30px]">
        <div aria-hidden className="h-[6px] rounded-pill bg-[linear-gradient(90deg,var(--good),var(--fill)_50%,var(--high))]" />
        <span aria-hidden className="absolute bottom-[-3px] left-1/2 h-[12px] w-[2px] -translate-x-1/2 rounded-pill bg-hint" />
        {own !== null ? (
          <span
            data-market-marker=""
            className={cn(
              "absolute bottom-[-4px] flex -translate-x-1/2 flex-col items-center gap-[4px]",
              !lite && "transition-[left] duration-700 ease-[cubic-bezier(.22,1,.36,1)]",
            )}
            style={{ left: `${revealed ? markerPosition(delta) : 50}%` }}
          >
            <span className="rounded-pill bg-text px-[8px] py-[2px] text-[13px] font-semibold whitespace-nowrap text-bg">{money.format(own)}</span>
            <span aria-hidden className="size-[14px] rounded-pill border-2 border-bg bg-text" />
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-[8px] text-[13px] text-hint">
        <span>{t("market.cheaper")}</span>
        <span className="text-center">{t("market.median", { value: money.format(comparison.value), unit: t(unitKey(comparison)) })}</span>
        <span>{t("market.pricier")}</span>
      </div>
      {context ? (
        <p data-market-context="" className="text-[13px] leading-snug text-hint">
          {context}
        </p>
      ) : null}
      {note ? (
        <p data-market-note="" className="rounded-medium bg-badge-warn-bg px-[12px] py-[10px] text-[14px] leading-snug text-badge-warn">
          {note}
        </p>
      ) : null}
    </section>
  );
}
