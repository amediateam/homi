"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import type { ComponentProps } from "react";

import { cn } from "../cn";

/**
 * The Radix Toast primitive with the legacy look (WP-20): a glass pill above the tab bar. Queueing, timing and the
 * single-toast rule of SCR-042 are WP-23.
 */
export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({ className, ...props }: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+12px)] z-(--z-toast) m-0 flex list-none flex-col items-center gap-2 px-(--gutter) outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Toast({ className, ...props }: ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "glass flex w-full max-w-(--feed-max) items-center gap-3 rounded-large px-4 py-3 text-text shadow-(--shadow-float) data-[state=open]:animate-rise-in",
        className,
      )}
      {...props}
    />
  );
}

export function ToastTitle({ className, ...props }: ComponentProps<typeof ToastPrimitive.Title>) {
  return <ToastPrimitive.Title data-slot="toast-title" className={cn("flex-1 font-semibold", className)} {...props} />;
}

export function ToastDescription({ className, ...props }: ComponentProps<typeof ToastPrimitive.Description>) {
  return <ToastPrimitive.Description data-slot="toast-description" className={cn("text-hint", className)} {...props} />;
}

export function ToastAction({ className, ...props }: ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn("shrink-0 font-semibold text-text underline-offset-2 active:opacity-60", className)}
      {...props}
    />
  );
}

export const ToastClose = ToastPrimitive.Close;
