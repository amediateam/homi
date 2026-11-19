"use client";

import { filtersHash, isCustomFilters, type SearchFilters, toSearchParams } from "@homi/search";
import { Button, RadarIcon, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useRadarsEnabled } from "@/features/radars/capability";
import { RadarSweep } from "@/features/radars/RadarSweep";
import { useSubscribe } from "@/features/radars/subscribe";
import { useRadars } from "@/features/radars/useRadars";
import { track } from "@/lib/analytics/events";
import { type DevFlags, devFlags } from "@/lib/flags";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { subscribeStorage } from "@/lib/storage";
import { tg } from "@/lib/telegram";

import { FEED_RADAR_SEEN_RATIO } from "./constants";
import { feedRadarButtonKey, feedRadarSeen, feedRadarSnoozed, feedRadarTitleKey, markFeedRadarSeen, shouldShowFeedRadar } from "./feedRadar";
import { readNudgeState, resetNudgeCloses, snoozeFeedRadar } from "./storage";

/** The card's × in force now; read from the store, so a × anywhere hides the card on every search at once. */
const snoozedNow = (): boolean => feedRadarSnoozed(readNudgeState(), Date.now());
/** The server renders no card. */
const snoozedOnServer = (): boolean => true;

/**
 * Whether the search list of `filters` shows the radar card (`shouldShowFeedRadar`): read by `FeedScreen`, which
 * passes the card into the list's `inline` slot only then — so while radars are switched off nothing is rendered and
 * nothing is sent. The plain radar list is `useRadars()`'s (one request with the nudges'), and the × is watched in
 * `homi-nudge`.
 */
export function useFeedRadar(filters: SearchFilters): boolean {
  const radarsEnabled = useRadarsEnabled();
  const { loaded, radarLimit } = useReference();
  const { radars } = useRadars();
  const snoozed = useSyncExternalStore(subscribeStorage, snoozedNow, snoozedOnServer);
  return shouldShowFeedRadar({ filters, radars, limit: radarLimit, radarsEnabled, referenceLoaded: loaded, snoozed });
}

export interface FeedRadarCardProps {
  /** The search of the list. */
  filters: SearchFilters;
  /** The app's flags; tests pass overrides. */
  flags?: DevFlags;
}

/**
 * The radar card in the search list (SCR-047, BR-APP-072; legacy `FeedRadarCard` of `Nudges.jsx`, `.feed-radar`): a
 * section on the fill with an inset hairline, 18 px corners and `20px 18px 18px` padding; the 56 px radar sweep with
 * two blips (still in lite graphics and with reduced motion, `RadarSweep`); the 22 px title per base deal; the hint;
 * a full-width primary button with the radar icon; × in the top right corner (32 px, `common.close`).
 *
 * The button plays a medium impact and starts the close streak of the nudges again; custom filters turn the radar on
 * through the subscribe flow (`entry: "feed"`, BR-APP-073), default ones open «Новый радар» with this search and
 * `entry=feed`. × hides the card on every search for 7 days (`feedOff`) and sends `feed_radar_closed`, without
 * counting towards the nudges' streak. `feed_radar_shown` goes once 60 % of the card is visible (`IntersectionObserver`,
 * threshold 0.6), once per search in a launch, and never where `IntersectionObserver` is missing.
 */
export function FeedRadarCard({ filters, flags = devFlags }: FeedRadarCardProps) {
  const t = useTranslations();
  const { subscribe } = useSubscribe({ flags });
  const card = useRef<HTMLElement>(null);
  const custom = isCustomFilters(filters);
  const hash = filtersHash(filters);

  useEffect(() => {
    const node = card.current;
    if (node === null || typeof IntersectionObserver === "undefined" || feedRadarSeen(hash)) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= FEED_RADAR_SEEN_RATIO)) {
          observer.disconnect();
          if (markFeedRadarSeen(hash)) {
            track("feed_radar_shown", { custom });
          }
        }
      },
      { threshold: FEED_RADAR_SEEN_RATIO },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hash, custom]);

  const enable = () => {
    tg.haptic.impact("medium");
    resetNudgeCloses();
    if (custom) {
      void subscribe(filters, "feed");
    } else {
      nav.push(routes.radarNew(toSearchParams(filters), "feed"));
    }
  };

  const close = () => {
    snoozeFeedRadar();
    track("feed_radar_closed", { custom });
  };

  return (
    <section
      ref={card}
      data-slot="feed-radar"
      className="relative flex flex-col items-start gap-[6px] rounded-photo bg-fill px-[18px] pt-[20px] pb-[18px] shadow-[inset_0_0_0_0.5px_var(--sep)]"
    >
      <RadarSweep size={56} blips={2} className="mb-[6px]" />
      <b className="pr-[28px] text-[22px] leading-[1.15] font-bold tracking-[-0.03em] text-text">{t(feedRadarTitleKey(filters.deal))}</b>
      <span className="text-[15px] leading-[1.35] text-hint">{t("feedRadar.what")}</span>
      <Button data-action="enable" className="mt-[10px] h-[48px] w-full px-[20px] text-[16px]" onClick={enable}>
        <RadarIcon size={18} />
        {t(feedRadarButtonKey(filters))}
      </Button>
      <button
        type="button"
        data-action="close"
        aria-label={t("common.close")}
        onClick={close}
        className="absolute top-[10px] right-[10px] grid size-[32px] place-items-center rounded-full text-hint"
      >
        <X size={16} aria-hidden />
      </button>
    </section>
  );
}
