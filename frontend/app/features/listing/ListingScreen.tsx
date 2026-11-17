"use client";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { cn, ErrorState } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useContext, useLayoutEffect } from "react";

import { marketVerdict } from "@/features/feed/verdict";
import { SourceReporter } from "@/features/shell/SourceReporter";
import { useRouter } from "@/i18n/navigation";
import { devFlags } from "@/lib/flags";
import { routes } from "@/lib/navigation/routes";

import { ListingCtaBar } from "./cta/ListingCtaBar";
import { type ListingContactView, useListingContact } from "./cta/useContact";
import { KeyFacts } from "./KeyFacts";
import { ListingHero } from "./ListingHero";
import { ListingSkeleton, SectionSkeleton } from "./ListingSkeleton";
import { ListingTitleRow } from "./ListingTitleRow";
import { type ListingDetails, type ListingInitial, type ListingPreview, placeLine } from "./listingData";
import { openOriginal } from "./openOriginal";
import { AuthorSection } from "./sections/AuthorSection";
import type { TranslationControl } from "./sections/controls";
import { DescriptionSection } from "./sections/DescriptionSection";
import { FactsSection } from "./sections/FactsSection";
import { HistorySection } from "./sections/HistorySection";
import { LocationSection } from "./sections/LocationSection";
import { MarketBlock } from "./sections/MarketBlock";
import { OriginalText } from "./sections/OriginalText";
import { SourcesSection } from "./sections/SourcesSection";
import { StatsSection } from "./sections/StatsSection";
import { useShareListing } from "./share/useShareListing";
import { useTranslation } from "./translation/useTranslation";
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
 * The preview and the loaded screen share one tree, so the hero keeps its photo and scroll, and the contact a tap
 * revealed, when the details replace the preview in the same instance. Top to bottom (`03` SCR-018): the hero, the
 * status banner, the title row and the key facts; then, with the details, the sections of blocks 5–13, or two section
 * skeletons while only the preview is there; the CTA bar fixed to the bottom inside the layer (pending until the
 * details are there). The contact, the translation and the share own their taps and haptics.
 */
function ListingBody({ number, item, details }: { number: number; item: ListingPreview; details: ListingDetails | null }) {
  const t = useTranslations();
  const router = useRouter();
  const contact = useListingContact(number, details);
  const translation = useTranslation(number);
  const { share, shareable } = useShareListing(number, item);
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
      <div className="mx-auto max-w-[608px]">
        <div className="flex flex-col gap-[16px] px-[16px] pt-[16px]">
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
            onShare={shareable ? share : undefined}
            onMenu={() => router.push(routes.listingActions(number))}
          />
          <KeyFacts item={item} marketCode={details?.market.code} />
          {details ? null : (
            <>
              <SectionSkeleton lines={3} />
              <SectionSkeleton lines={4} />
            </>
          )}
        </div>
        {details ? <ListingSections number={number} details={details} phone={contact.phone} translation={translation} /> : null}
      </div>
      <ListingCtaBar item={item} details={details} cta={contact.cta} />
    </div>
  );
}

/**
 * Blocks 5–13 of the loaded screen in legacy's order: market, facts, stats, history, location (with «Рядом»),
 * author, description, and the source with the original text inside its disclosure. Each section brings its own
 * gutter and leaves itself out when it has nothing to show.
 */
function ListingSections({
  number,
  details,
  phone,
  translation,
}: {
  number: number;
  details: ListingDetails;
  phone: ListingContactView["phone"];
  translation: TranslationControl | null;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);

  return (
    <div data-slot="listing-sections" className="flex flex-col pt-[4px]">
      <MarketBlock number={number} details={details} verdict={marketVerdict(details, locale, translate)} />
      <FactsSection facts={details.facts} />
      <StatsSection stats={details.stats} />
      <HistorySection number={number} history={details.price_history} tashkentDates={devFlags.dev014TashkentDates} />
      <LocationSection number={number} details={details} place={placeLine(details)} />
      <AuthorSection number={number} ownerLabel={details.owner_label} offers={details.offers} posted={details.posted} phone={phone} />
      <DescriptionSection summary={details.summary} />
      <SourcesSection number={number} sources={details.sources} originalText={details.original.text}>
        <OriginalText number={number} text={details.original.text ?? ""} phone={phone} translation={translation} />
      </SourcesSection>
    </div>
  );
}
