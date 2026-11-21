"use client";

import { leaveRef, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { openSettingsThen } from "../closeOwnerForm";
import { normalizeOwnerListing, type OwnerListingView } from "../normalize";
import { useOwnerPending } from "../pending";
import { firstPending } from "../status";
import { useOwnerListings } from "../store";
import { trackAttention } from "./attention";
import { dismissRequestTip, useRequestTipDone } from "./tipState";

/** The addresses over which the tab tip never shows (SCR-060): a listing, the owner form and lists, a filters sheet. */
function coveredBy(pathname: string): boolean {
  switch (matchRoute(pathname).route) {
    case "listing":
    case "owner":
    case "ownerNew":
    case "ownerListings":
    case "ownerRequests":
    case "ownerLimit":
    case "filters":
    case "quickFilter":
      return true;
    default:
      return false;
  }
}

/** One tip's frame: the text (a tap is the tip's action) and «×», which dismisses both tips for good. */
function TipFrame({ text, onOpen, className, ...rest }: { text: string; onOpen: () => void; className: string; "data-request-tip": string }) {
  const t = useTranslations();
  useEffect(() => trackAttention("coach", "shown"), []);
  return (
    <div ref={leaveRef("tip")} role="status" className={className} {...rest}>
      <button
        type="button"
        data-action="tip-open"
        onClick={() => {
          tg.haptic.impact("light");
          trackAttention("coach", "clicked");
          onOpen();
        }}
        className="min-w-0 flex-1 text-left text-[14px] leading-[1.35] font-semibold"
      >
        {text}
      </button>
      <button type="button" data-action="tip-close" aria-label={t("owner.tipClose")} onClick={dismissRequestTip} className="grid size-[28px] flex-none place-items-center rounded-full">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

const TIP = "flex items-center gap-[8px] rounded-[14px] bg-accent px-[12px] py-[8px] text-accent-text shadow-(--shadow-float)";

/**
 * The tab tip «Пришёл первый отклик! Он в «Настройки» → «Мои объявления»» (WP-82, SCR-060, DEV-059) above the tab bar:
 * while requests wait, `homi-req-tip` is not `done`, the current tab is not Settings, and no listing, owner form, owner
 * list or filters sheet is open. A tap presses the Settings tab, then opens «Мои объявления» on the first listing with
 * requests waiting (default (b)), or the list while it is unknown.
 */
export function RequestTabTip({ settingsTab, pathname }: { settingsTab: boolean; pathname: string }) {
  const t = useTranslations();
  const { pending, hasListings } = useOwnerPending();
  const done = useRequestTipDone();
  const list = useOwnerListings({ enabled: hasListings && pending > 0 });
  const target = useMemo(
    () => firstPending((list.data?.items ?? []).map(normalizeOwnerListing).filter((item): item is OwnerListingView => item !== null)),
    [list.data],
  );
  if (pending === 0 || done || settingsTab || coveredBy(pathname)) {
    return null;
  }
  return (
    <TipFrame
      data-request-tip="tab"
      text={t("own.reqTip.tab")}
      className={`fixed inset-x-[16px] bottom-[calc(var(--bottom-chrome)+8px)] z-(--z-nudge) mx-auto max-w-[576px] ${TIP}`}
      onOpen={() => void openSettingsThen(target === null ? routes.ownerListings() : routes.ownerListings({ focus: target.id }))}
    />
  );
}

/** The card tip «Вот здесь ваши отклики» on the first card with requests waiting (SCR-060): a tap opens its requests. */
export function RequestCardTip({ listingId }: { listingId: string }) {
  const t = useTranslations();
  const done = useRequestTipDone();
  if (done) {
    return null;
  }
  return (
    <TipFrame
      data-request-tip="card"
      text={t("own.reqTip.card")}
      className={`absolute inset-x-[10px] top-[48px] z-2 ${TIP}`}
      onOpen={() => nav.push(routes.ownerRequests(listingId))}
    />
  );
}
