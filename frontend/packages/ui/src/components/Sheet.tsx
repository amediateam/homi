"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";

import { cn } from "../cn";

/**
 * Bottom sheet (shadcn/ui `Sheet` on Radix Dialog, restyled, WP-20): the legacy sheet rises from the bottom over a
 * dimmed backdrop and keeps the bottom inset clear. Drag-to-close with velocity is written on top of it by WP-23.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export function SheetOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-(--z-backdrop) bg-dim data-[state=open]:animate-fade", className)}
      {...props}
    />
  );
}

export function SheetContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-(--z-backdrop) flex max-h-[calc(100%-var(--top-inset)-24px)] flex-col rounded-t-large bg-sheet pb-(--bottom-inset) text-text shadow-(--shadow-float) outline-none data-[state=open]:animate-rise",
          className,
        )}
        {...props}
      >
        <SheetHandle />
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

/** The grab handle at the top of a sheet; WP-23 makes it draggable. */
export function SheetHandle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="sheet-handle" aria-hidden className={cn("flex justify-center pt-2 pb-1", className)} {...props}>
      <span className="h-1 w-9 rounded-pill bg-sep" />
    </div>
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("px-(--gutter) text-[20px] leading-tight font-bold", className)}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("px-(--gutter) text-hint", className)}
      {...props}
    />
  );
}
