"use client";

import { cn, ErrorState, Skeleton } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useContext, useLayoutEffect } from "react";

import { SourceReporter } from "@/features/shell/SourceReporter";
import { useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/navigation/routes";

import { KeyFacts } from "./KeyFacts";
import { ListingHero } from "./ListingHero";
import { ListingSkeleton, SectionSkeleton } from "./ListingSkeleton";
import { ListingTitleRow } from "./ListingTitleRow";
import { type ListingDetails, type ListingInitial, type ListingPreview, placeLine } from "./listingData";
import { openOriginal } from "./openOriginal";
import { ListingLayerContext, useListing, type ListingView } from "./useListing";
import { heroIndexOf, rememberHeroIndex } from "./viewState";

export interface ListingScreenProps {
  /** The layer's number; `null` for an address without a valid one (the server part calls `notFound()`). */
  number: number | null;
  /** The server's read (`ListingServer`); left out by the fallback instance, which never reads. */
  initial?: ListingInitial | null;
}

/** Tells the layer which state this instance shows (its swipe gate). */
function useReportView(state: ListingView["state"]): void {
  const { reportView } = useContext(ListingLayerContext);
  useLayoutEffect(() => {
    reportView(state);
  }, [reportView, state]);
}

/** Error states have no hero under Telegram's header, and the layer keeps no top inset: they clear it themselves. */
const CLEAR_HEADER = "pt-[calc(16px+var(--top-inset))]";

/**
 * The listing screen (WP-26, SCR-018, SCR-019) inside the listing layer: the fallback instance while the server part
 * streams, then the resolved one with the server's read. Skeleton, then the card's preview with section skeletons
 * and a pending CTA, then the details; an error replaces everything (no hero, title or CTA). The CTA bar is fixed to
 * the bottom inside the layer, so the content pads for it.
 */
export function ListingScreen({ number, initial }: ListingScreenProps) {
  return number === null ? <InvalidNumber /> : <ListingContent number={number} initial={initial} />;
}

function InvalidNumber() {
  useReportView("skeleton");
  return (
    <div data-listing-state="skeleton">
      <ListingSkeleton />
    </div>
  );
}

function ListingContent({ number, initial }: { number: number; initial?: ListingInitial | null }) {
  const t = useTranslations();
  const view = useListing(number, { initial });
  useReportView(view.state);

  let content;
  switch (view.state) {
    case "skeleton":
      content = <ListingSkeleton />;
      break;
    case "not_found":
      content = (
        <p className={cn(CLEAR_HEADER, "px-[16px] text-center text-[15px] text-hint")}>{t("listing.loadFailed")}</p>
      );
      break;
    case "offline":
    case "server":
      content = (
        <div className={CLEAR_HEADER}>
          <ErrorState
            tall
            kind={view.state}
            title={view.state === "offline" ? t("error.offline") : t("common.loadFailed")}
            text={view.state === "offline" ? t("error.offlineText") : t("error.serverText")}
            retryLabel={t("error.retry")}
            onRetry={view.retry}
          />
        </div>
      );
      break;
    case "preview":
      content = <ListingBody number={number} item={view.preview} details={null} />;
      break;
    case "loaded":
      content = <ListingBody number={number} item={view.details} details={view.details} />;
      break;
  }

  return (
    <div data-listing-state={view.state}>
      {content}
      {initial !== undefined && view.state === "loaded" ? <SourceReporter source={view.source} /> : null}
    </div>
  );
}

/**
 * The preview and the loaded screen share one tree, so the hero keeps its photo and scroll when the details replace
 * the preview in the same instance.
 */
function ListingBody({ number, item, details }: { number: number; item: ListingPreview; details: ListingDetails | null }) {
  const t = useTranslations();
  const router = useRouter();
  const videoUrl = details && details.has_video && !details.original.deleted ? details.original.url : null;

  return (
    <div className="pb-[calc(88px+var(--bottom-inset))]">
      <ListingHero
        photos={details ? details.photos.items : item.photos.preview}
        total={details ? details.photos.items.length : item.photos.count}
        video={item.has_video}
        initialIndex={heroIndexOf(number)}
        onActiveChange={(index) => rememberHeroIndex(number, index)}
        onOpenPhoto={(index) => router.push(routes.listingPhotos(number, index))}
        onOpenVideo={videoUrl === null ? undefined : () => openOriginal(number, videoUrl, "video")}
        photoLabel={t("viewer.title")}
      />
      <div className="mx-auto flex max-w-[608px] flex-col gap-[16px] px-[16px] pt-[16px]">
        {item.status_text ? (
          <p
            data-status-banner=""
            className="rounded-medium bg-badge-warn-bg px-[14px] py-[10px] text-[15px] font-medium text-badge-warn"
          >
            {item.status_text}
          </p>
        ) : null}
        <ListingTitleRow
          number={number}
          title={item.title}
          place={placeLine(item)}
          favorite={item.favorite}
          onMenu={() => router.push(routes.listingActions(number))}
        />
        <KeyFacts item={item} marketCode={details?.market.code} />
        {details ? (
          <div data-slot="listing-sections" />
        ) : (
          <>
            <SectionSkeleton lines={3} />
            <SectionSkeleton lines={4} />
          </>
        )}
      </div>
      {details ? null : (
        <div
          data-cta=""
          className="fixed inset-x-0 bottom-0 z-(--z-cta) border-t border-sep bg-bg pb-[calc(12px+var(--bottom-inset))]"
        >
          <div className="mx-auto flex max-w-[608px] items-center gap-[12px] px-[16px] pt-[12px]">
            <Skeleton className="h-[22px] w-[40%]" />
            <div data-cta-action="pending" className="ml-auto w-[45%]">
              <Skeleton className="h-[48px] w-full rounded-large" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
