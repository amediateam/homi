"use client";

import { Button, cn, ErrorState, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useEffect, useRef } from "react";

import { SourceReporter } from "@/features/shell/SourceReporter";
import { usePathname } from "@/i18n/navigation";
import type { UiError } from "@/lib/api/errors";
import { useSessionMap } from "@/lib/data/sessionMaps";
import type { DevFlags } from "@/lib/flags";
import { matchRoute, type RouteMatch } from "@/lib/navigation/routes";
import { OwnerEntryLine, OwnerEntryRow } from "@/features/owner/entry/OwnerEntry";
import { useOwnerEnabled } from "@/features/owner/store";
import { useSession } from "@/lib/session/SessionProvider";

import { type FeedSource, type FewResultsContext, listEnd } from "./fewResults";
import { inlineSlotIndex } from "./inlineSlot";
import { ListingCard } from "./ListingCard";
import { FEED_FRAME, ListingCardSkeleton } from "./ListingCardSkeleton";
import type { ListingPreview } from "./types";
import { type CursorPath, type FeedInitial, useCursorFeed } from "./useCursorFeed";

/** The first cards load their first photo at once with high priority (SCR-007, legacy `EAGER_CARDS`). */
const EAGER_CARDS = 2;
/** The next page is asked for while the sentinel is this close to the screen (BR-APP-024). */
const SENTINEL_MARGIN = "800px";
/** The first load shows three card skeletons (SCR-008). */
const SKELETONS = [0, 1, 2];

/** The route of each list's own address: only there does the list report its source to the demo marker (KI-43). */
const OWN_ROUTE: Record<FeedSource, RouteMatch["route"]> = { feed: "feed", favorites: "saved", history: "history" };

export interface ListingFeedProps {
  /** The search feed, favourites or history (WP-29): which items are visible and whether the eye shows. */
  source: FeedSource;
  /** The cursor list read in the browser (`useCursorFeed`). */
  path: CursorPath;
  /** The query of page one; for one `listKey` it serialises the same on every render (`useCursorFeed`). */
  query: URLSearchParams;
  /** A new key re-creates the list from page one: the search feed's is its canonical query and refresh version. */
  listKey: string;
  /** The server's page one (cookie mode); adopted only when its key equals `listKey`. */
  initial?: FeedInitial<ListingPreview> | null;
  /** The network rule the server saw (`Photo`): read by the server render and the hydration render only. */
  serverSmallOnly?: boolean;
  /**
   * The few-results note of the search feed (BR-APP-025): `context` for `showsFewResults`, `render` called with the
   * number of visible items when the note shows. It shows below the cards, and the empty state then does not.
   */
  few?: { context: FewResultsContext | null; render: (visible: number) => ReactNode };
  /** The empty state (SCR-009): fully loaded, no error shown, no visible item, and no few-results note. */
  emptySlot?: ReactNode;
  /** A block inside the search list, once, at `inlineSlotIndex` (SCR-047, WP-30); never with another source. */
  inline?: ReactNode;
  /** A block above the first card, only while one is visible (history's «Очистить», WP-29). */
  above?: ReactNode;
  /**
   * Called each time page one of the list shown has answered, the server's adopted one included: the feed's
   * pull-to-refresh spins until then (SCR-010).
   */
  onFirstPage?: () => void;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

/**
 * The items a list shows (`03` §1.11): the search drops those hidden in this launch, favourites also those
 * un-favourited in it; history shows every item it gets (legacy `ListingFeed.jsx`, WP-29).
 */
function visibleOf(
  items: readonly ListingPreview[],
  source: FeedSource,
  favs: ReadonlyMap<number, boolean>,
  hidden: ReadonlySet<number>,
): readonly ListingPreview[] {
  if (source === "history") {
    return items;
  }
  return items.filter((item) => !hidden.has(item.number) && (source !== "favorites" || favs.get(item.number) !== false));
}

/** A failed page shows the inline retry below the cards (SCR-008): with items, and for `forbidden` on any page. */
function isInline(error: UiError, hasItems: boolean): boolean {
  return error === "forbidden" || hasItems;
}

/**
 * A failed page (SCR-008). Without items: `ErrorState`, WifiOff «Нет связи» for `offline` and `timeout`, CloudOff «Не
 * загрузилось» for any other error. With items, and for `forbidden` on any page: the inline «Не загрузилось —
 * повторить» or «Нет доступа — повторить» below the cards. Each repeats the failed page only.
 */
function FeedError({ error, hasItems, onRetry }: { error: UiError; hasItems: boolean; onRetry: () => void }) {
  const t = useTranslations();
  if (isInline(error, hasItems)) {
    return (
      <Button
        variant="secondary"
        data-retry={error === "forbidden" ? "forbidden" : "failed"}
        className="mx-auto h-auto px-[16px] py-[10px] text-[15px]"
        onClick={() => onRetry()}
      >
        {t("feed.retry", { error: t(error === "forbidden" ? "common.noAccess" : "common.loadFailed") })}
      </Button>
    );
  }
  const offline = error === "offline" || error === "timeout";
  return (
    <ErrorState
      kind={offline ? "offline" : "server"}
      title={offline ? t("error.offline") : t("common.loadFailed")}
      text={offline ? t("error.offlineText") : t("error.serverText")}
      retryLabel={t("error.retry")}
      onRetry={onRetry}
    />
  );
}

/**
 * A listing list (SCR-007, SCR-008, SCR-009; legacy `ListingFeed`): the search feed here, favourites and history in
 * WP-29. Page one is the server's `initial` when its key matches — rendered at once, on the server and in the first
 * client render, whatever the session status — else three skeletons until the session is ready and page one
 * answers. The cards take the launch's session maps over the server's flags: `favs` for the heart, `seen` for the
 * eye (never in history), and the search and favourites drop what `visibleOf` hides at once.
 *
 * The sentinel asks for the next page within 800 px. It is observed only while the session is ready and a page can
 * follow, and anew after each page: an observer reports only a crossing, and a sentinel still in reach must ask
 * again. Nothing asks after an error. A spinner stands at the sentinel while a page loads. After the cards: the
 * few-results note or the empty state, as `listEnd` decides; `inline` stands among the cards at `inlineSlotIndex`;
 * the search feed loaded to its end says «Это всё по вашему поиску» (`data-feed-end`) unless the note shows.
 * The answers' `meta.source` reaches the demo marker only while the list's own address is shown, not under a listing
 * or a sheet opened over it (KI-43). `inline` is one keyed row among the cards, so a card hidden above it moves it
 * without a remount.
 *
 * For screen readers (WCAG 4.1.3, 2.4.3): the list is `aria-busy` while page one loads, a status line reads
 * «Загрузка…» (`feed.loading`) while a page loads and the inline error once a later page failed (`ErrorState` is an
 * alert itself), and a retry moves the focus to the list, since the button it was on goes away.
 */
export function ListingFeed({
  source,
  path,
  query,
  listKey,
  initial,
  serverSmallOnly,
  few,
  emptySlot,
  inline,
  above,
  onFirstPage,
  flags,
}: ListingFeedProps) {
  const t = useTranslations();
  const session = useSession();
  const enabled = session.status === "ready";
  const feed = useCursorFeed<ListingPreview>({ key: listKey, path, query, initial, enabled, renewed: session.renewed, flags });
  const favs = useSessionMap("favs");
  const seen = useSessionMap("seen");
  const hidden = useSessionMap("hidden");
  const own = matchRoute(usePathname()).route === OWN_ROUTE[source];

  const visible = visibleOf(feed.items, source, favs, hidden);
  const end = listEnd({ source, done: feed.done, error: feed.error !== null, visible: visible.length }, few?.context ?? null);
  const slot = source === "feed" ? inlineSlotIndex(visible.length, feed.done, end === "few") : null;
  // The end block (WP-39, DEC-90): the search feed loaded to its end with cards. It holds «Это всё по вашему поиску»
  // unless the few-results note already says so, and the owner invitation (WP-82, BR-APP-115), which then stands alone
  // under the note. With no card left, the invitation is a line under the empty state or the note.
  const loadedToEnd = source === "feed" && feed.done && feed.error === null;
  const cabinetOn = useOwnerEnabled();
  const endLine = loadedToEnd && visible.length > 0 && end !== "few";
  const feedEnd = endLine || (loadedToEnd && visible.length > 0 && cabinetOn);
  const emptyEntry = loadedToEnd && visible.length === 0 && (end === "empty" || end === "few");

  const answered = feed.status !== "loading";
  useEffect(() => {
    if (answered) {
      onFirstPage?.();
    }
  }, [answered, listKey, onFirstPage]);

  const list = useRef<HTMLDivElement>(null);
  const { retry } = feed;
  const onRetry = () => {
    list.current?.focus({ preventScroll: true });
    retry();
  };

  const sentinel = useRef<HTMLDivElement>(null);
  const { loadMore } = feed;
  const watching = enabled && feed.status === "success" && !feed.done && !feed.loadingMore;
  useEffect(() => {
    const node = sentinel.current;
    if (!watching || node === null) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: SENTINEL_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [watching, loadMore]);

  const rows: ReactNode[] = visible.map((item, index) => (
    <ListingCard
      key={item.number}
      item={item}
      favorite={favs.get(item.number) ?? item.favorite}
      viewed={source !== "history" && (seen.has(item.number) || item.viewed)}
      eager={index < EAGER_CARDS}
      serverSmallOnly={serverSmallOnly}
    />
  ));
  if (slot !== null && inline) {
    rows.splice(slot, 0, <Fragment key="inline">{inline}</Fragment>);
  }

  const hasItems = feed.items.length > 0;
  const loading = feed.status === "loading" || feed.loadingMore;
  const failed = feed.error !== null && isInline(feed.error.error, hasItems) ? feed.error.error : null;
  return (
    <div ref={list} data-feed={source} tabIndex={-1} aria-busy={feed.status === "loading"} className={cn(FEED_FRAME, "outline-none")}>
      {visible.length > 0 ? above : null}
      {rows}
      {feed.status === "loading" ? SKELETONS.map((key) => <ListingCardSkeleton key={key} />) : null}
      {feed.error ? <FeedError error={feed.error.error} hasItems={hasItems} onRetry={onRetry} /> : null}
      {end === "few" ? few?.render(visible.length) : null}
      {feedEnd ? (
        <div data-feed-end="" className="-mt-[8px] flex flex-col gap-[12px]">
          {endLine ? <p className="text-center text-[13px] text-hint">{t("feed.end")}</p> : null}
          <OwnerEntryRow />
        </div>
      ) : null}
      {end === "empty" ? emptySlot : null}
      {emptyEntry ? <OwnerEntryLine src="empty" /> : null}
      <div ref={sentinel} data-sentinel="" className="grid min-h-[48px] place-items-center">
        {feed.loadingMore ? <Spinner aria-hidden className="size-[22px] border-[2.5px] text-accent" /> : null}
      </div>
      <p role="status" data-feed-status="" className="sr-only">
        {loading ? t("feed.loading") : failed === null ? null : t(failed === "forbidden" ? "common.noAccess" : "common.loadFailed")}
      </p>
      <SourceReporter source={own ? feed.source : undefined} />
    </div>
  );
}
