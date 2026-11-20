"use client";

import { ChevronRight } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useAgeLabel } from "@/features/feed/CardAge";
import { Photo } from "@/features/feed/Photo";
import type { ListingPreview } from "@/features/feed/types";
import { useSessionMap } from "@/lib/data/sessionMaps";

/** Ghost mini-cards while the finds are not there (legacy three `radar-mini ghost`). */
export const STRIP_GHOSTS = 3;

export interface RadarStripProps {
  /** The newest finds; `null` while the preview is not there (ghosts). */
  finds: readonly ListingPreview[] | null;
  /** The radar is on: only then a find the user has not opened carries «новое». */
  active: boolean;
  /** The link after the finds: «Все {n}», or «Смотреть найденное» without a count (and with DEV-022 on). */
  allLabel: string;
  onListing: (item: ListingPreview) => void;
  onAll: () => void;
}

/**
 * The sub-line of a mini-card: the district (else the place) · the age, each only when known. The age is computed when
 * the strip renders and does not follow the minute clock (legacy `RadarStrip`).
 */
function SubLine({ item }: { item: ListingPreview }) {
  const age = useAgeLabel(item, false);
  return (
    <span className="-mt-[4px] truncate text-[12px] text-hint">
      {[item.district?.name ?? item.place, age].filter(Boolean).join(" · ")}
    </span>
  );
}

/**
 * «Последние находки» of the radar sheet (SCR-028, legacy `RadarStrip`): a sideways strip under the 16 px gutters
 * (`data-scroll-x`, so the sheet lets it scroll). While the finds are not there, three ghosts; with none, «Пока
 * ничего — радар пришлёт, как появится»; else a mini-card per find — the cover (136 × 102), «новое» on a find not
 * opened yet (the server's `viewed`, or opened in this launch) while the radar is on, the price («—» without one)
 * with its period, district · age — and the link «Все {n} ›». Server strings render as text.
 */
export function RadarStrip({ finds, active, allLabel, onListing, onAll }: RadarStripProps) {
  const t = useTranslations();
  const seen = useSessionMap("seen");
  if (finds !== null && finds.length === 0) {
    return (
      <p data-radar-strip="none" className="py-[8px] text-[14px] text-hint">
        {t("radar.none")}
      </p>
    );
  }
  return (
    <div
      data-radar-strip={finds === null ? "loading" : "finds"}
      data-scroll-x=""
      aria-busy={finds === null || undefined}
      className="-mx-(--gutter) flex gap-[10px] overflow-x-auto overscroll-x-contain px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {finds === null
        ? Array.from({ length: STRIP_GHOSTS }, (_, index) => (
            <span key={index} data-radar-ghost="" aria-hidden className="h-[140px] w-[136px] shrink-0 rounded-small bg-fill" />
          ))
        : finds.map((item) => {
            const fresh = active && !item.viewed && !seen.has(item.number);
            return (
              <button
                key={item.number}
                type="button"
                data-radar-find={item.number}
                onClick={() => onListing(item)}
                className="flex w-[136px] shrink-0 flex-col gap-[5px] rounded-small text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative block h-[102px] w-[136px] overflow-hidden rounded-small bg-fill">
                  <Photo src={item.photos.cover ?? item.photos.preview[0] ?? null} sizes="136px" />
                  {fresh ? (
                    <span
                      data-radar-new=""
                      className="absolute top-[6px] left-[6px] rounded-[6px] bg-accent px-[6px] py-[2px] text-[11px] font-bold text-accent-text"
                    >
                      {t("radar.new")}
                    </span>
                  ) : null}
                </span>
                <b className="truncate text-[16px] font-extrabold tracking-[-0.01em]">
                  {item.price?.display ?? "—"}
                  {item.price?.period ? <small className="text-[12px] font-medium text-hint">{item.price.period}</small> : null}
                </b>
                <SubLine item={item} />
              </button>
            );
          })}
      {finds !== null ? (
        <button
          type="button"
          data-radar-all=""
          onClick={onAll}
          className="flex h-[102px] w-[96px] shrink-0 flex-col items-center justify-center gap-[4px] rounded-small bg-fill text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {allLabel}
          <ChevronRight size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
