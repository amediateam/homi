"use client";

import dynamic from "next/dynamic";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { Button, ErrorState, SearchX } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useContext, useEffect, useLayoutEffect } from "react";

import { marketVerdict } from "@/features/feed/verdict";
import { listingKnown } from "@/features/shell/ScreenTracker";
import { SourceReporter } from "@/features/shell/SourceReporter";
import { useRouter } from "@/i18n/navigation";
import { devFlags } from "@/lib/flags";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { OwnerEntryLine } from "@/features/owner/entry/OwnerEntry";
import { MineBar } from "@/features/owner/panel/MineBar";
import { OwnerPanel } from "@/features/owner/panel/OwnerPanel";
import { OwnerPanelFooterSkeleton } from "@/features/owner/panel/MineBar";
import { OwnerPriceSection } from "@/features/owner/panel/OwnerPriceSection";

import { formatResponseTime } from "@homi/i18n/format";

import { ListingCtaBar } from "./cta/ListingCtaBar";
import { isRequestMode, requestStatusOf } from "./cta/owner";
import { ClaimedOwnerSection } from "./owner/ClaimedOwnerSection";
import { OwnerChip } from "./owner/OwnerChip";
import { chipShown } from "./owner/ownerTier";

/** The owner panel's footer brings the cabinet's actions: loaded only on the user's own listing (WP-82). */
const OwnerPanelFooter = dynamic(() => import("@/features/owner/panel/OwnerPanelFooter").then((module) => module.OwnerPanelFooter), {
  ssr: false,
  loading: () => <OwnerPanelFooterSkeleton />,
});
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
  // The listing's pageview waits for its record or its failure (WP-32).
  const known = view.state !== "skeleton" && view.state !== "preview";
  // The user's own listing is named `owner/listing` (legacy since `index-CIa0Ldj2.js`, WP-82).
  const mine = view.state === "loaded" && view.details.owner?.mine === true;
  useEffect(() => {
    if (known) {
      listingKnown(number, { mine });
    }
  }, [known, mine, number]);

  let content;
  switch (view.state) {
    case "skeleton":
      content = <ListingSkeleton />;
      break;
    case "not_found":
      content = <ListingGone />;
      break;
    case "day_limit":
      content = (
        <div className={CLEAR_HEADER}>
          <ErrorState
            tall
            kind="server"
            data-reason="day_limit"
            title={t("error.dayLimit")}
            text={t("error.dayLimitText")}
            retryLabel={t("error.retry")}
            onRetry={view.retry}
          />
        </div>
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
 * A listing that is gone (`404`, SCR-019, legacy since `index-CIa0Ldj2.js`): `SearchX`, «Этого объявления уже нет —
 * квартиру, похоже, сдали или продали» and «Смотреть свежие», which gives a light impact and closes the listing through
 * the layer's close — to the page below, or to the feed on a direct load; the feed is not read again. No retry. Laid
 * out as the tall `ErrorState` beside it (the same classes), which takes no icon of the caller's.
 */
function ListingGone() {
  const t = useTranslations();
  const { close } = useContext(ListingLayerContext);
  return (
    <div
      role="alert"
      data-listing-gone=""
      className={CLEAR_HEADER}
    >
      <div className="flex flex-col items-center gap-2.5 px-6 py-16 pt-24 text-center text-hint">
        <span className="mb-1.5 grid size-16 place-items-center rounded-pill bg-fill text-text">
          <SearchX size={28} aria-hidden />
        </span>
        <p className="max-w-[300px] text-[17px] font-bold text-text">{t("listing.gone")}</p>
        <Button
          variant="secondary"
          className="mt-2.5 px-4 text-[15px]"
        onClick={() => {
          tg.haptic.impact("light");
          close();
        }}
      >
          {t("listing.goneFresh")}
        </Button>
      </div>
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
  // The user's own listing (WP-82, BR-APP-103): its owner panel and footer when the card names the owner listing.
  const mine = details?.owner?.mine === true;
  const ownerId = mine ? (details?.owner?.listing_id ?? null) : null;

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
            mine={mine}
          />
          {chipShown({ is_owner: item.is_owner, owner_verified: (item as { owner_verified?: boolean }).owner_verified, owner: details?.owner }) ? (
            <OwnerChip number={number} loaded={details !== null} />
          ) : null}
          <KeyFacts item={item} marketCode={details?.market.code} />
          {ownerId === null ? null : <OwnerPanel listingId={ownerId} number={number} />}
          {details ? null : (
            <>
              <SectionSkeleton lines={3} />
              <SectionSkeleton lines={4} />
            </>
          )}
        </div>
        {details ? <ListingSections number={number} details={details} phone={contact.phone} translation={translation} mine={mine} ownerId={ownerId} /> : null}
      </div>
      {!mine ? (
        <ListingCtaBar item={item} details={details} cta={contact.cta} onRequest={() => router.push(routes.listingContact(number))} />
      ) : ownerId === null ? (
        <MineBar />
      ) : (
        <OwnerPanelFooter listingId={ownerId} number={number} />
      )}
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
  mine = false,
  ownerId = null,
}: {
  number: number;
  details: ListingDetails;
  phone: ListingContactView["phone"];
  translation: TranslationControl | null;
  /** The user's own listing (WP-82): «Цена» after the facts with the market block under it, and no «Источник». */
  mine?: boolean;
  ownerId?: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  // The owner tiers (WP-83, BR-APP-100, BR-APP-102): no section compares a server string with a text (LB-APP-075).
  const tier = details.owner?.tier ?? null;
  const self = tier === "self";
  const minutes = details.owner?.response_minutes ?? null;
  const responseTime = self && !mine && minutes !== null ? formatResponseTime(minutes, locale) : null;
  const pending = isRequestMode(details) && requestStatusOf(details) === "pending";

  return (
    <div data-slot="listing-sections" className="flex flex-col pt-[4px]">
      {mine ? null : <MarketBlock number={number} details={details} verdict={marketVerdict(details, locale, translate)} />}
      <FactsSection facts={details.facts} />
      {mine ? (
        <>
          <OwnerPriceSection details={details} ownerId={ownerId} />
          <MarketBlock number={number} details={details} verdict={marketVerdict(details, locale, translate)} />
        </>
      ) : null}
      <StatsSection stats={details.stats} />
      <HistorySection
        number={number}
        history={details.price_history}
        tashkentDates={devFlags.dev014TashkentDates}
        selfPlaced={self ? (details.origin === "native" ? "native" : "legacy") : null}
      />
      <LocationSection number={number} details={details} place={placeLine(details)} />
      {tier === "claimed" ? <ClaimedOwnerSection /> : null}
      <AuthorSection
        number={number}
        ownerLabel={details.owner_label}
        offers={details.offers}
        posted={details.posted}
        phone={phone}
        responseTime={responseTime}
        pendingNote={self && pending}
      />
      <DescriptionSection summary={details.summary} ownerText={self ? (details.owner?.description ?? null) : null} />
      {mine || self ? null : (
        <SourcesSection number={number} sources={details.sources} originalText={details.original.text}>
          <OriginalText number={number} text={details.original.text ?? ""} phone={phone} translation={translation} />
        </SourcesSection>
      )}
      {/* «Тоже сдаёте квартиру?» (WP-82, BR-APP-115, DEC-94): the card's `owner.entry`, which leaves out the user's own. */}
      {details.owner?.entry === true ? <OwnerEntryLine src="listing" /> : null}
    </div>
  );
}
