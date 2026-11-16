"use client";

import { CloudOff, RotateCw, WifiOff } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";
import { Button } from "./Button";
import { stateLayout } from "./EmptyState";

/** `offline`: no network or a timeout; `server`: any other failure. The caller maps its error to one of the two. */
export type ErrorStateKind = "offline" | "server";

export type ErrorStateProps = Omit<ComponentProps<"div">, "title" | "children"> & {
  kind: ErrorStateKind;
  title: ReactNode;
  text: ReactNode;
  retryLabel: ReactNode;
  /** Called once per tap of the retry button, without arguments. */
  onRetry: () => void;
  /** The taller variant for a whole screen (the listing, the radar tab, settings). */
  tall?: boolean;
};

/**
 * A list or screen that did not load (WP-23, legacy `ErrorState`): WifiOff for `offline`, CloudOff for `server`, the
 * caller's texts, and a retry button with RotateCw (D-UI-9).
 */
export function ErrorState({
  kind,
  title,
  text,
  retryLabel,
  onRetry,
  tall = false,
  className,
  ...props
}: ErrorStateProps) {
  const Icon = kind === "offline" ? WifiOff : CloudOff;
  return (
    <div
      data-slot="error-state"
      data-kind={kind}
      role="alert"
      className={cn(stateLayout({ tall }), className)}
      {...props}
    >
      <span
        data-slot="error-state-icon"
        className="mb-1.5 grid size-16 place-items-center rounded-pill bg-fill text-text"
      >
        <Icon size={28} aria-hidden />
      </span>
      <p data-slot="error-state-title" className="text-[17px] font-bold text-text">
        {title}
      </p>
      <p data-slot="error-state-text" className={cn(tall && "max-w-[300px]")}>
        {text}
      </p>
      <Button variant="secondary" className="mt-2.5 px-4 text-[15px]" onClick={() => onRetry()}>
        <RotateCw size={16} aria-hidden />
        {retryLabel}
      </Button>
    </div>
  );
}
