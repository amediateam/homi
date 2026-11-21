"use client";

import { ErrorState, Plus, SegmentedControl, Spinner } from "@homi/ui";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useMinute } from "@/features/feed/minuteClock";
import { SubPage } from "@/features/shell/SubPage";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { normalizeOwnerListing, type OwnerListingView } from "../normalize";
import { firstPending, isPast, splitLists } from "../status";
import { type OwnerListingsBody, useOwnerEnabled, useOwnerListings } from "../store";
import { OwnerListingCard } from "./OwnerListingCard";
import { useStatusAction } from "./useStatusAction";

type Tab = "current" | "past";

const toView = (items: readonly unknown[]) => items.map(normalizeOwnerListing).filter((item): item is OwnerListingView => item !== null);

/**
 * «Мои объявления» (WP-82, SCR-057, BR-APP-088, BR-APP-094, BR-APP-095) in its `SubPage` under Settings: «Актуальные» /
 * «История» with a red dot on a tab that holds requests waiting; the cards; the empty texts («С возвращением!» when only
 * past listings exist); below «Актуальные», while the cabinet is on, «+ Сдать ещё одну квартиру» (the limit sheet when
 * `can_add` is `false`) and «Можно сдавать до {max} квартир сразу.» (LB-APP-057). A spinner first; a failed first read
 * the tall error with «Повторить»; a later failed read keeps the list. `?focus=<id>` (the tab tip, DEV-059) opens the
 * tab holding that listing, scrolls its card into view and leaves the address. `cardTip` draws SCR-060's card tip.
 */
export function OwnerListingsPage({ cardTip }: { cardTip?: (listing: OwnerListingView) => ReactNode } = {}) {
  const t = useTranslations();
  const cabinetOn = useOwnerEnabled();
  const list = useOwnerListings();
  const now = (useMinute(true) ?? 0) * 60_000;
  const [tab, setTab] = useState<Tab>("current");
  const body = list.data;
  const items = useMemo(() => toView(body?.items ?? []), [body]);
  const { current, past } = useMemo(() => splitLists(items), [items]);
  const { mutate, refetch } = list;
  const { busy, run } = useStatusAction({
    onDone: ({ listing, id }) =>
      mutate((value): OwnerListingsBody => {
        const known = value ?? { items: [], max: 0, can_add: true, past: 0 };
        return {
          ...known,
          items: listing === null ? known.items.filter((item) => item.id !== id) : known.items.map((item) => (item.id === id ? (listing as unknown as typeof item) : item)),
        };
      }),
    onLocked: () => void refetch(),
  });

  // `?focus=<id>`: the tab of that listing, once per value of the parameter ("adjusting state when a prop changes").
  const focus = useSearchParams()?.get("focus") ?? null;
  const [focused, setFocused] = useState<string | null>(null);
  const target = focus === null ? null : (items.find((item) => item.id === focus) ?? null);
  if (focus !== null && focus !== focused && body !== undefined) {
    setFocused(focus);
    if (target !== null) {
      setTab(isPast(target) ? "past" : "current");
    }
  }
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (focused === null || focus !== focused) {
      return;
    }
    root.current?.querySelector(`[data-owner-card="${CSS.escape(focused)}"]`)?.scrollIntoView?.({ block: "center" });
    nav.replace(routes.ownerListings());
  }, [focus, focused]);

  const shown = tab === "current" ? current : past;
  const tipped = firstPending(shown);
  const dot = (part: readonly OwnerListingView[]) => part.some((item) => (item.stats?.pending ?? 0) > 0);

  let content: ReactNode;
  if (body === undefined && list.error !== null) {
    const offline = list.error.error === "offline" || list.error.error === "timeout";
    content = (
      <ErrorState
        tall
        kind={offline ? "offline" : "server"}
        title={offline ? t("error.offline") : t("common.loadFailed")}
        text={offline ? t("error.offlineText") : t("error.serverText")}
        retryLabel={t("error.retry")}
        onRetry={() => void refetch()}
      />
    );
  } else if (body === undefined) {
    content = (
      <div data-owner-list-state="loading" className="grid min-h-[96px] place-items-center">
        <Spinner aria-label={t("feed.loading")} className="size-[22px] border-[2.5px] text-accent" />
      </div>
    );
  } else {
    // BR-APP-095: nothing current, but listings in the past — «С возвращением!» with their number.
    const empty = tab === "past" ? t("own.pastEmpty") : body.past > 0 ? t("own.welcome", { n: body.past }) : t("own.mineEmpty");
    content = (
      <div className="flex flex-col gap-[12px]">
        {shown.length === 0 ? (
          <p data-owner-list-empty={tab} className="px-[4px] py-[24px] text-center text-[15px] leading-[1.45] text-hint">
            {empty}
          </p>
        ) : (
          shown.map((listing) => (
            <OwnerListingCard
              key={listing.id}
              listing={listing}
              now={now}
              busy={busy !== null}
              onChange={(change) => void run(listing, change)}
              tip={tipped?.id === listing.id ? cardTip?.(listing) : undefined}
            />
          ))
        )}
        {tab === "current" && cabinetOn ? (
          <>
            <button
              type="button"
              data-action="add-another"
              onClick={() => {
                tg.haptic.impact("light");
                nav.push(body.can_add === false ? routes.ownerLimit({ where: "mine" }) : routes.ownerNew());
              }}
              className="flex h-[48px] items-center justify-center gap-[6px] rounded-[16px] border border-dashed border-sep text-[15px] font-semibold text-accent"
            >
              <Plus size={18} aria-hidden />
              {t("own.addAnother")}
            </button>
            <p data-owner-foot="" className="text-center text-[13px] text-hint">
              {t("own.mineFoot", { n: body.max })}
            </p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <SubPage data-route="owner/mine" title={t("own.mine")} bare>
      <div ref={root} className="flex flex-col gap-[14px]">
        <SegmentedControl<Tab>
          aria-label={t("own.mine")}
          value={tab}
          onValueChange={(next) => {
            tg.haptic.impact("light");
            setTab(next);
          }}
          options={[
            { value: "current", label: <TabLabel text={t("own.tab.now")} dot={dot(current)} /> },
            { value: "past", label: <TabLabel text={t("own.tab.past")} dot={dot(past)} /> },
          ]}
        />
        {content}
      </div>
    </SubPage>
  );
}

function TabLabel({ text, dot }: { text: string; dot: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      {text}
      {dot ? <span data-tab-dot="" aria-hidden className="ml-[6px] size-[7px] rounded-full bg-danger" /> : null}
    </span>
  );
}
