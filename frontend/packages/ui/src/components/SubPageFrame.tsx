"use client";

import { type ComponentProps, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";

import { cn } from "../cn";
import { useSwipeBack } from "../hooks/useSwipeBack";

export interface SubPageFrameProps extends Omit<ComponentProps<"section">, "title" | "ref"> {
  /** The page title. */
  title: ReactNode;
  /** Before the title in the header, e.g. a back button where Telegram shows none. */
  back?: ReactNode;
  /** A paragraph under the content. */
  hint?: ReactNode;
  /** The content without the card around it. */
  bare?: boolean;
  /** Called by swipe back; Telegram's BackButton is wired by the app. */
  onBack: () => void;
  /** Swipe back is on; the app turns it off on Android (TMA-041) and while a layer is open over the page. */
  swipeBack?: boolean;
  /** The page starts to follow the finger (haptics are passed in by the app, TMA-025). */
  onSwipeStart?: () => void;
  /** The swipe closes the page; `onBack` follows once it has slid out. */
  onSwipeCommit?: () => void;
}

/**
 * Whether the page is scrolled: a sentinel over the top 2 px of the scroll area has left the page's viewport.
 * Without IntersectionObserver the header stays flat.
 */
function useScrolled(rootRef: RefObject<HTMLElement | null>, sentinelRef: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) {
          setScrolled(!entry.isIntersecting);
        }
      },
      { root },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rootRef, sentinelRef]);

  return scrolled;
}

/**
 * Full-screen sub-page (WP-23, SCR-033 to SCR-039): a fixed layer at the sub-page level that slides in from 24 %,
 * scrolls itself, and keeps a glass header whose separator appears once the content is scrolled. The content sits in
 * a card unless `bare`; `hint` is the paragraph under it. A swipe back moves the whole layer (`useSwipeBack`).
 */
export function SubPageFrame({
  title,
  back,
  hint,
  bare = false,
  onBack,
  swipeBack = true,
  onSwipeStart,
  onSwipeCommit,
  className,
  children,
  ...props
}: SubPageFrameProps) {
  const pageRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const scrolled = useScrolled(pageRef, sentinelRef);
  useSwipeBack(pageRef, onBack, { enabled: swipeBack, onSwipeStart, onCommit: onSwipeCommit });

  return (
    <section
      ref={pageRef}
      data-slot="subpage"
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-0 z-(--z-subpage) animate-subpage-in overflow-y-auto overscroll-contain bg-bg pb-[calc(24px+var(--bottom-inset))] text-text data-swiping:shadow-[-10px_0_30px_color-mix(in_srgb,var(--dim)_45%,transparent)]",
        className,
      )}
      {...props}
    >
      <div
        ref={sentinelRef}
        aria-hidden
        data-slot="subpage-sentinel"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
      />
      <header
        data-slot="subpage-header"
        data-scrolled={scrolled ? "" : undefined}
        className="glass sticky top-0 z-2 mb-[14px] border-b-[0.5px] border-transparent px-(--gutter) pt-[calc(8px+var(--top-inset))] pb-[8px] transition-[border-color] duration-200 data-scrolled:border-sep"
      >
        <div className="mx-auto flex max-w-(--feed-max) items-center gap-2">
          {back}
          <h1
            id={titleId}
            data-slot="subpage-title"
            className="min-w-0 flex-1 py-[2px] text-[28px] leading-tight font-bold tracking-[-0.03em]"
          >
            {title}
          </h1>
        </div>
      </header>
      <div data-slot="subpage-body" className="mx-auto max-w-(--feed-max) px-(--gutter)">
        {bare ? (
          children
        ) : (
          <div data-slot="subpage-card" className="overflow-hidden rounded-medium bg-fill">
            {children}
          </div>
        )}
        {hint ? (
          <p data-slot="subpage-hint" className="mx-[4px] mt-[8px] text-[13px] leading-[1.4] text-hint">
            {hint}
          </p>
        ) : null}
      </div>
    </section>
  );
}
