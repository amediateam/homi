"use client";

import { ErrorState, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";

import { dismissRequestTip } from "../signals/tipState";
import { RequestCard } from "./RequestCard";
import { useAnswer } from "./useAnswer";
import { useOwnerRequests } from "./useOwnerRequests";

/**
 * The requests of one owner listing (WP-82, SCR-058): the one list both frames show — «Отклики» under «Мои объявления»
 * and the overlay over the user's own listing. A spinner, then the cards newest first (the next page of 20 loads when
 * the end comes into view), the foot line; «Откликов пока нет.» when empty;
 * the error with «Повторить» when page one failed. Opening it dismisses the request tips for good (BR-APP-092).
 */
export function RequestList({ listingId }: { listingId: string }) {
  const t = useTranslations();
  const requests = useOwnerRequests(listingId);
  const { busy, run } = useAnswer({ onAnswered: requests.replace, onClosed: () => void requests.reload() });
  const end = useRef<HTMLDivElement>(null);
  const { more, loadMore, loadingMore, stalled } = requests;

  useLayoutEffect(() => dismissRequestTip(), []);

  useEffect(() => {
    const node = end.current;
    if (!more || stalled || node === null) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      // No observer (an old WebView, the tests): the next page loads at once, until the cursor ends.
      void loadMore();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, stalled, loadMore]);

  if (!requests.loaded && requests.error !== null) {
    const offline = requests.error.error === "offline" || requests.error.error === "timeout";
    return (
      <ErrorState
        tall
        kind={offline ? "offline" : "server"}
        title={offline ? t("error.offline") : t("common.loadFailed")}
        text={offline ? t("error.offlineText") : t("error.serverText")}
        retryLabel={t("error.retry")}
        onRetry={() => void requests.reload()}
      />
    );
  }
  if (!requests.loaded) {
    return (
      <div data-requests-state="loading" className="grid min-h-[96px] place-items-center">
        <Spinner aria-label={t("feed.loading")} className="size-[22px] border-[2.5px] text-accent" />
      </div>
    );
  }
  return (
    <div data-requests={listingId} className="flex flex-col gap-[12px]">
      {requests.items.length === 0 ? (
        <p data-requests-state="empty" className="px-[4px] py-[24px] text-center text-[15px] text-hint">
          {t("own.noRequests")}
        </p>
      ) : (
        requests.items.map((request) => <RequestCard key={request.id} request={request} busy={busy !== null} onAnswer={(action) => void run(request, action)} />)
      )}
      {more ? (
        <div ref={end} className="grid place-items-center py-[8px]">
          {loadingMore ? (
            <Spinner aria-label={t("feed.loading")} className="size-[20px] border-[2.5px] text-accent" />
          ) : stalled ? (
            <button type="button" data-action="more-retry" onClick={() => void loadMore()} className="text-[14px] font-semibold text-accent">
              {t("error.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      <p data-requests-foot="" className="px-[4px] text-[13px] leading-[1.4] text-hint">
        {t("own.requestsFoot")}
      </p>
    </div>
  );
}
