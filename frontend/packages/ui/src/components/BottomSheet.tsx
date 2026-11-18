"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { useBodyClass } from "../hooks/useBodyClass";
import { useSheetChrome } from "../hooks/useSheetChrome";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { buttonVariants } from "./Button";

export interface BottomSheetProps {
  open: boolean;
  /** The ×, a backdrop tap, a drag down from the header and Escape all ask here; the owner closes (`back()`). */
  onClose: () => void;
  /** `false`: the backdrop, the drag and Escape do nothing (the first-launch city sheet). Default `true`. */
  dismissible?: boolean;
  /** `full`: fixed height below the top inset (the filters sheet); `compact`: as tall as its content. */
  variant?: "full" | "compact";
  /** The dialog's accessible name, shown in the header; focus moves to it on open. */
  title: ReactNode;
  /** More header: the trailing action of the full row (× · title · «Сбросить»), a line under the compact row. */
  header?: ReactNode;
  /**
   * The control left of the title in the compact row's 40 px cell (the ‹ of a report step, WP-26); empty without one.
   * The full variant has no such cell and ignores it.
   */
  leading?: ReactNode;
  /** Sticky footer above the bottom inset. */
  footer?: ReactNode;
  /** Label of the ×; without one there is no × (the market sheet of WP-26). */
  closeLabel?: string;
  /** A sheet over another open sheet (the city sheet over the filters): 60 over 50, as legacy (`03` §3.6). */
  stacked?: boolean;
  /**
   * Escape asks `onClose`. Default: `dismissible`. A sheet whose backdrop and drag are off only because no page lies
   * below it (the standalone route sheet of the app) still closes on Escape, as by its ×.
   */
  closeOnEscape?: boolean;
  /**
   * `false` renders the sheet where it stands instead of in a portal at the end of `body`, so the server HTML holds
   * it (a sheet address loaded directly; a portal has nothing to render into on the server). Default `true`.
   */
  portal?: boolean;
  /**
   * This opening shows the sheet in place: no rise and no backdrop fade (legacy `.instant`; the radar sheet on the
   * return from a radar's feed, WP-30). Read when the sheet opens; a later change does nothing to a sheet already up,
   * so dropping the flag after the first render never starts the rise late. Default `false`.
   */
  instant?: boolean;
  /** A drag on the header starts. */
  onDragStart?: () => void;
  /** A drag closes the sheet; legacy plays a light impact here (TMA-025). `onClose` follows after the slide. */
  onDragCommit?: () => void;
  className?: string;
  children?: ReactNode;
}

/** Close requests while a drag holds or closes the sheet are ignored: the drag decides, and `onClose` runs once. */
function dragOwnsSheet(sheet: HTMLElement | null): boolean {
  return !!sheet && (sheet.hasAttribute("data-dragging") || sheet.hasAttribute("data-closing"));
}

/**
 * `instant` as it was when the sheet last opened (on mount, or when `open` turned `true`): the entrance classes may
 * not change on a sheet that is up, since adding `animate-rise` to an open sheet would start the rise then.
 */
function useInstantOpening(open: boolean, instant: boolean): boolean {
  const [opening, setOpening] = useState({ open, instant });
  if (open !== opening.open) {
    setOpening({ open, instant: open ? instant : opening.instant });
  }
  return opening.instant;
}

/**
 * Bottom sheet (WP-23, `03` §1.2) on the Radix Dialog parts of WP-20: a modal dialog (`aria-modal`, focus trapped,
 * moved to the title on open and back to the element that had it on close) that rises over a dimmed backdrop,
 * capped at the 608 px column. It closes by the ×, a backdrop tap, a drag down from the header (`useSheetDrag`) and
 * Escape — every one only asks `onClose`; a non-dismissible sheet ignores all but the × (and Escape with
 * `closeOnEscape`). Dragging inside the body never closes it. A stacked sheet is the top layer: a tap on its backdrop
 * and Escape close it alone. The backdrop and the sheet go to a portal at the end of `body` unless `portal={false}`
 * renders them in place; positioned `fixed`, they then need an ancestor without a transform.
 *
 * The header (grab handle, title, ×) and the footer are glass over the body, which scrolls under them with the
 * paddings `useSheetChrome` measures. While open, `body` carries `sheet-open` (and `locked` for the full variant),
 * counted across stacked sheets; the page under the sheet does not scroll or rubber-band, while the sheet body and
 * horizontal strips marked `data-scroll-x` do. Under `prefers-reduced-motion` the entrance does not play (motion.css);
 * an `instant` opening has none either (`data-instant` on the sheet).
 */
export function BottomSheet({
  open,
  onClose,
  dismissible = true,
  variant = "compact",
  title,
  header,
  leading,
  footer,
  closeLabel,
  stacked = false,
  closeOnEscape = dismissible,
  portal = true,
  instant = false,
  onDragStart,
  onDragCommit,
  className,
  children,
}: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  /** The element focused when the sheet opened: Radix returns focus to a `Trigger`, and these sheets have none. */
  const openerRef = useRef<HTMLElement | null>(null);
  useBodyClass("sheet-open", open);
  useBodyClass("locked", open && variant === "full");
  const still = useInstantOpening(open, instant);

  const requestClose = () => {
    if (!dragOwnsSheet(sheetRef.current)) {
      onClose();
    }
  };
  const layer = stacked ? "z-(--z-toast)" : "z-(--z-backdrop)";

  const backdrop = (
    <DialogPrimitive.Overlay
      ref={overlayRef}
      data-slot="bottom-sheet-overlay"
      className={cn("fixed inset-0 bg-dim", !still && "data-[state=open]:animate-fade", layer)}
    />
  );
  const sheet = (
    <DialogPrimitive.Content
      ref={sheetRef}
      data-slot="bottom-sheet"
      data-variant={variant}
      data-instant={still ? "" : undefined}
      aria-modal="true"
      aria-describedby={undefined}
      className={cn(
        "group/sheet fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-(--feed-max) flex-col overflow-hidden rounded-t-large bg-sheet text-text shadow-(--shadow-float) outline-none",
        !still && "data-[state=open]:animate-rise",
        variant === "full"
          ? "h-[calc(100%-var(--top-inset)-24px)]"
          : "max-h-[calc(100%-var(--top-inset)-24px)]",
        layer,
        className,
      )}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        const active = document.activeElement;
        openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
        titleRef.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const opener = openerRef.current;
        openerRef.current = null;
        if (opener?.isConnected) {
          opener.focus({ preventScroll: true });
        }
      }}
      onEscapeKeyDown={(event) => {
        if (!closeOnEscape) {
          event.preventDefault();
        }
      }}
      onPointerDownOutside={(event) => {
        // Only the backdrop is a tap away; anything else outside (a toast, a second sheet) is not.
        const target = event.detail.originalEvent.target;
        if (!dismissible || !(target instanceof Node && overlayRef.current?.contains(target))) {
          event.preventDefault();
        }
      }}
    >
      <SheetFrame
        sheetRef={sheetRef}
        overlayRef={overlayRef}
        titleRef={titleRef}
        variant={variant}
        title={title}
        header={header}
        leading={leading}
        footer={footer}
        closeLabel={closeLabel}
        dismissible={dismissible}
        onClose={onClose}
        onRequestClose={requestClose}
        onDragStart={onDragStart}
        onDragCommit={onDragCommit}
      >
        {children}
      </SheetFrame>
    </DialogPrimitive.Content>
  );

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          requestClose();
        }
      }}
    >
      {portal ? (
        <DialogPrimitive.Portal>
          {backdrop}
          {sheet}
        </DialogPrimitive.Portal>
      ) : (
        <>
          {backdrop}
          {sheet}
        </>
      )}
    </DialogPrimitive.Root>
  );
}

interface SheetFrameProps
  extends Pick<BottomSheetProps, "title" | "header" | "leading" | "footer" | "closeLabel" | "onDragStart" | "onDragCommit"> {
  sheetRef: RefObject<HTMLDivElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  variant: "full" | "compact";
  dismissible: boolean;
  onClose: () => void;
  onRequestClose: () => void;
  children?: ReactNode;
}

/**
 * The inside of the sheet. Its hooks run here, not in `BottomSheet`: the portal mounts the overlay and the sheet one
 * render after the root, so only effects of a component inside the sheet find the elements.
 */
function SheetFrame({
  sheetRef,
  overlayRef,
  titleRef,
  variant,
  title,
  header,
  leading,
  footer,
  closeLabel,
  dismissible,
  onClose,
  onRequestClose,
  onDragStart,
  onDragCommit,
  children,
}: SheetFrameProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  useSheetDrag(headerRef, sheetRef, onClose, {
    enabled: dismissible,
    backdropRef: overlayRef,
    onDragStart,
    onCommit: onDragCommit,
  });
  useSheetChrome(sheetRef, headerRef, footerRef, Boolean(footer));
  usePageLock(overlayRef, sheetRef, bodyRef);
  useScrolledMark(sheetRef, bodyRef);

  const close = closeLabel ? (
    <button
      type="button"
      data-slot="bottom-sheet-close"
      aria-label={closeLabel}
      className={cn(buttonVariants({ variant: "secondary", size: "icon" }), "size-9")}
      onClick={onRequestClose}
    >
      <X className="size-5" strokeWidth={2.25} aria-hidden />
    </button>
  ) : null;
  const heading = (
    <DialogPrimitive.Title
      ref={titleRef}
      tabIndex={-1}
      data-slot="bottom-sheet-title"
      className="min-w-0 text-center text-[17px] leading-snug font-bold outline-none"
    >
      {title}
    </DialogPrimitive.Title>
  );
  const grab = "block h-[5px] w-[38px] rounded-pill bg-sep";

  return (
    <>
      <div
        ref={headerRef}
        data-slot="bottom-sheet-header"
        className={cn(
          "glass absolute inset-x-0 top-0 z-2 touch-none border-b-[0.5px] border-transparent transition-[border-color] duration-200 select-none group-data-[scrolled]/sheet:border-sep",
          variant === "full" &&
            "grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-(--gutter) pt-[18px] pb-3",
          variant === "compact" && "pt-2",
        )}
      >
        {variant === "full" ? (
          <>
            <span
              data-slot="bottom-sheet-handle"
              aria-hidden
              className={cn(grab, "absolute top-1.5 left-1/2 -translate-x-1/2")}
            />
            <div className="justify-self-start">{close}</div>
            {heading}
            <div className="justify-self-end">{header}</div>
          </>
        ) : (
          <>
            <span data-slot="bottom-sheet-handle" aria-hidden className={cn(grab, "mx-auto mb-1.5")} />
            <div className="grid grid-cols-[40px_1fr_40px] items-center px-(--gutter) pt-0.5 pb-1">
              {leading ?? <span aria-hidden />}
              {heading}
              <div className="justify-self-end">{close}</div>
            </div>
            {header}
          </>
        )}
      </div>
      <div
        ref={bodyRef}
        data-slot="bottom-sheet-body"
        className={cn(
          "min-h-0 flex-auto overflow-y-auto overscroll-contain pt-(--fsheet-head) scroll-pt-(--fsheet-head)",
          footer ? "pb-(--fsheet-foot) scroll-pb-(--fsheet-foot)" : "pb-[calc(16px+var(--bottom-inset))]",
        )}
      >
        {children}
      </div>
      {footer ? (
        <div
          ref={footerRef}
          data-slot="bottom-sheet-footer"
          className="glass absolute inset-x-0 bottom-0 z-2 border-t-[0.5px] border-sep px-(--gutter) pt-3 pb-[calc(12px+var(--bottom-inset))]"
        >
          {footer}
        </div>
      ) : null}
    </>
  );
}

/**
 * The page under a sheet stays put (legacy sheet drag, `03` §1.2): a touch move on the backdrop, or on a part of the
 * sheet that does not scroll, is cancelled, which also stops the iOS rubber band. A sideways move on a strip marked
 * `data-scroll-x` that can scroll, and any move inside a body that can scroll, are left alone. Radix' own scroll lock
 * stays on top of this; this keeps the legacy rule explicit and independent of it.
 */
function usePageLock(
  overlayRef: RefObject<HTMLElement | null>,
  sheetRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const areas = [overlayRef.current, sheetRef.current].filter((area): area is HTMLElement => area !== null);
    let startX = 0;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        startX = touch.clientX;
        startY = touch.clientY;
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!event.cancelable) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const touch = event.touches[0];
      const strip = target?.closest("[data-scroll-x]");
      if (
        strip &&
        sheetRef.current?.contains(strip) &&
        strip.scrollWidth > strip.clientWidth + 1 &&
        touch &&
        Math.abs(touch.clientX - startX) > Math.abs(touch.clientY - startY)
      ) {
        return;
      }
      const body = bodyRef.current;
      if (body && target && body.contains(target) && body.scrollHeight > body.clientHeight + 1) {
        return;
      }
      event.preventDefault();
    };

    for (const area of areas) {
      area.addEventListener("touchstart", onTouchStart, { passive: true });
      area.addEventListener("touchmove", onTouchMove, { passive: false });
    }
    return () => {
      for (const area of areas) {
        area.removeEventListener("touchstart", onTouchStart);
        area.removeEventListener("touchmove", onTouchMove);
      }
    };
  }, [overlayRef, sheetRef, bodyRef]);
}

/** `data-scrolled` on the sheet while its body is scrolled: the header shows its separator (legacy `.scrolled`). */
function useScrolledMark(sheetRef: RefObject<HTMLElement | null>, bodyRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const sheet = sheetRef.current;
    const body = bodyRef.current;
    if (!sheet || !body) {
      return undefined;
    }
    const onScroll = () => sheet.toggleAttribute("data-scrolled", body.scrollTop > 0);
    onScroll();
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => body.removeEventListener("scroll", onScroll);
  }, [sheetRef, bodyRef]);
}
