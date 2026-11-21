"use client";

import { type ComponentProps, type ReactNode, useId, useRef } from "react";

import { cn } from "../cn";
import { useBodyClass } from "../hooks/useBodyClass";
import { useScrolled } from "../hooks/useScrolled";
import { useSwipeBack } from "../hooks/useSwipeBack";
import { useLeave } from "../lib/leave";

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
 * Full-screen sub-page (WP-23, SCR-033 to SCR-039): a fixed layer at the sub-page level that slides in from 24 %,
 * scrolls itself, and keeps a glass header whose separator appears once the content is scrolled. The content sits in
 * a card unless `bare`; `hint` is the paragraph under it. A swipe back moves the whole layer (`useSwipeBack`). While
 * mounted it holds the body class `subpage-open`, so the page under it does not scroll (WP-36, layout.css). When it
 * goes, a copy of it leaves to the right (`lib/leave.ts`, WP-39), unless the swipe took it away.
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
  useBodyClass("subpage-open");
  useLeave(pageRef, "subpage");

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
