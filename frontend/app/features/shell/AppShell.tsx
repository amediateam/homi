"use client";

import { ErrorState } from "@homi/ui";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, Suspense, useEffect, useState } from "react";

import { useBootRetryState } from "@/features/gates/bootRetryStore";
import { NudgeHost } from "@/features/nudges/NudgeHost";
import { usePathname } from "@/i18n/navigation";
import { matchRoute, parentOf } from "@/lib/navigation/routes";
import { rememberHref } from "@/lib/ui/shellState";

import { MiniTitle } from "./MiniTitle";
import { PullToRefresh } from "./PullToRefresh";
import { activeTabOf, isLayerAddress, type ShellVariant, shellVariantOf } from "./shellVariant";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";
import { useMiniChrome } from "./useMiniChrome";
import { ViewToggle } from "./ViewToggle";

/**
 * The variant the chrome draws at an address. A listing or a sheet reached by a soft navigation lies over the page it
 * was opened from, which stays mounted below (`isLayerAddress`): the chrome keeps the variant it drew there, so the
 * page keeps its top bar, tab bar and spacers — its height and scroll position — and the swipe back of the listing
 * (WP-26) uncovers it whole. The first address the shell draws has nothing below it, so a direct load draws the
 * address's own variant (`none` for a listing). Only the variant is kept: the bars still read the live address for
 * their contents (the deal, the badge), as the page below does — out of sight under the opaque listing. State adjusted
 * while rendering, as `RouteSheet` does: each of the two chrome parts keeps its own copy and sees the same addresses,
 * and a render that never commits leaves no trace.
 */
function useDrawnVariant(pathname: string, searchParams: URLSearchParams): ShellVariant {
  const own = shellVariantOf(pathname, searchParams);
  const [drawn, setDrawn] = useState(own);
  const variant = isLayerAddress(pathname) ? drawn : own;
  if (variant !== drawn) {
    setDrawn(variant);
  }
  return variant;
}

/** The locale-less address and its shell variant. Reads the search parameters, so it renders inside `<Suspense>`. */
function useShellAddress() {
  const pathname = usePathname();
  const query = useSearchParams()?.toString() ?? "";
  const searchParams = new URLSearchParams(query);
  return { pathname, query, searchParams, variant: useDrawnVariant(pathname, searchParams) };
}

/** The chrome above the page: the mini title (search list only) and the top bar, which pads for Telegram's header. */
function ShellTop() {
  const { variant } = useShellAddress();
  if (variant === "none") {
    return <div aria-hidden className="h-(--top-inset)" />;
  }
  return (
    <>
      {variant === "search-list" ? <MiniTitle /> : null}
      <TopBar variant={variant} />
    </>
  );
}

/**
 * The chrome below the page and the shell's memory. The list/map toggle shows on the search tab and not while
 * drawing; the nudges (WP-30, `NudgeHost`, z 35 above the tab bar) everywhere, since each decides where it shows; the
 * tab bar wherever the variant has a tab. The collapsing chrome follows the feed itself — not a sheet over it, nor a
 * layer parameter on it (`parentOf` of the feed is not `null` only then). The search and saved roots are remembered
 * for the tab bar. The spacer keeps the end of the page above the tab bar and the floating toggle.
 */
function ShellBottom() {
  const { pathname, query, searchParams, variant } = useShellAddress();
  const tab = activeTabOf(variant);

  useMiniChrome(matchRoute(pathname).route === "feed" && parentOf(pathname, searchParams) === null);

  useEffect(() => {
    rememberHref(pathname, query);
  }, [pathname, query]);

  return (
    <>
      {variant === "search-list" || variant === "map" ? <ViewToggle variant={variant} /> : null}
      <PullToRefresh />
      <NudgeHost searchTab={tab === "search"} />
      {tab ? <TabBar active={tab} /> : null}
      <div aria-hidden className={tab ? "h-(--bottom-chrome)" : "h-(--bottom-inset)"} />
    </>
  );
}

/**
 * The page, or `ErrorState` once the sign-in failed six times in a row (BR-APP-054, D-S-3): the visible equivalent
 * of the legacy feed error. «Повторить» resets the boot retry's counter and signs in again; the page returns with the
 * session.
 */
function ShellContent({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { failed, kind, retry } = useBootRetryState();
  if (!failed || kind === null) {
    return children;
  }
  return (
    <ErrorState
      kind={kind}
      title={kind === "offline" ? t("error.offline") : t("common.loadFailed")}
      text={kind === "offline" ? t("error.offlineText") : t("error.serverText")}
      retryLabel={t("error.retry")}
      onRetry={retry}
    />
  );
}

/**
 * The shell of `(main)` (WP-23, SCR-006), in the legacy order: mini title, top bar, the page, view toggle,
 * pull-to-refresh indicator, tab bar, then the overlay slot below the sheet slot (`03` §3.6). The page is one phone
 * column of at most 608 px with no width breakpoints; the chrome reads the address inside `<Suspense>`
 * (`use-search-params.md`), and the page and the slots stay outside it, so they never wait for the chrome.
 *
 * Nothing that wraps the page or the slots carries a transform, a filter or a z-index of its own: the in-place
 * standalone sheet and the sub-page are `position: fixed` inside them and must stay fixed to the viewport, above the
 * chrome. The z-order is the chrome's own: top bar 10, toggle 29, tab bar 30, mini title 31, nudge 35.
 */
export function AppShell({ children, overlay, sheet }: { children: ReactNode; overlay: ReactNode; sheet: ReactNode }) {
  return (
    <div data-shell="">
      <Suspense fallback={null}>
        <ShellTop />
      </Suspense>
      <main data-shell-content="" className="mx-auto w-full max-w-(--feed-max)">
        <ShellContent>{children}</ShellContent>
      </main>
      <Suspense fallback={null}>
        <ShellBottom />
      </Suspense>
      {overlay}
      {sheet}
    </div>
  );
}
