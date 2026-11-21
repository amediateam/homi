"use client";

import { cn, useScrolled } from "@homi/ui";
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef } from "react";

export interface OwnerFrameProps extends Omit<ComponentProps<"div">, "title"> {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The bar at the bottom (the form's «Дальше», a step's button), at `--z-owner-bar`. */
  footer?: ReactNode;
}

/**
 * The full-screen frame of the owner form (WP-81, SCR-050 … SCR-056): the title and subtitle in a glass header whose
 * separator appears once the layer is scrolled (the scroll shadow of legacy `OwnerShell`), the body, and the footer
 * bar. The layer (`RouteOverlay`) scrolls itself, so the frame watches a sentinel inside it.
 */
export function OwnerFrame({ title, subtitle, footer, children, className, ...props }: OwnerFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLElement | null>(null);
  // Before the observer's passive effect: the scroll area is the layer around the frame.
  useLayoutEffect(() => {
    layerRef.current = frameRef.current?.closest<HTMLElement>('[data-slot="route-overlay"]') ?? null;
  }, []);
  const scrolled = useScrolled(layerRef, sentinelRef);

  return (
    <div
      ref={frameRef}
      data-owner-frame=""
      className={cn("relative flex min-h-full flex-col", className)}
      {...props}
    >
      <div ref={sentinelRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" />
      <header
        data-owner-header=""
        data-scrolled={scrolled ? "" : undefined}
        className="glass sticky top-0 z-2 border-b-[0.5px] border-transparent px-(--gutter) pt-[calc(12px+var(--top-inset))] pb-[10px] transition-[border-color] duration-200 data-scrolled:border-sep"
      >
        <h1 data-owner-title="" className="pr-10 text-[26px] leading-tight font-bold tracking-[-0.03em]">
          {title}
        </h1>
        {subtitle === undefined ? null : <p className="mt-1 text-[14px] leading-[1.4] text-hint">{subtitle}</p>}
      </header>
      <div data-owner-body="" className="flex-1 px-(--gutter) pt-3 pb-6">
        {children}
      </div>
      {footer === undefined ? null : (
        <div
          data-owner-footer=""
          className="glass sticky bottom-0 z-(--z-owner-bar) border-t-[0.5px] border-sep px-(--gutter) pt-3 pb-[calc(12px+var(--bottom-inset))]"
        >
          {footer}
        </div>
      )}
    </div>
  );
}
