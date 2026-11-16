"use client";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";

type ChipProps = Omit<ComponentProps<"button">, "children"> & {
  /** An icon before the label (a lucide icon or `RadarIcon`); it never shrinks. */
  icon?: ReactNode;
  /** The label. A long one is cut with an ellipsis; a plain-text label is also the `title`. */
  children?: ReactNode;
};

/** The full text of a plain-text label, so a label cut by the ellipsis can still be read in the `title`. */
function fullText(children: ReactNode): string | undefined {
  return typeof children === "string" || typeof children === "number" ? String(children) : undefined;
}

function ChipLabel({ slot, children }: { slot: string; children: ReactNode }) {
  if (children === undefined || children === null || children === "" || typeof children === "boolean") {
    return null;
  }
  return (
    <span data-slot={slot} className="min-w-0 truncate">
      {children}
    </span>
  );
}

const chipBase =
  "inline-flex h-9 max-w-full flex-none items-center rounded-pill border border-sep px-3.5 text-[14px] whitespace-nowrap text-text transition-[background-color,border-color,color,opacity] duration-(--dur-fast) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0";

export type HeaderChipProps = ChipProps & {
  /** The filter behind the chip is set (legacy `on`). */
  highlighted?: boolean;
  /**
   * A badge after the label, shown when above zero (the number of active filter groups on the filters chip). It is
   * decorative: put the count into `aria-label` where it should be read out.
   */
  count?: number;
};

/**
 * A chip of the feed header (WP-23, legacy `hchip`): opens a sheet, shows whether its filter is set and, on the
 * filters chip, how many groups are. An icon-only chip needs an `aria-label`. Haptics are the caller's `onClick`.
 */
export function HeaderChip({
  highlighted = false,
  count,
  icon,
  children,
  title,
  type,
  className,
  ...props
}: HeaderChipProps) {
  return (
    <button
      data-slot="header-chip"
      data-state={highlighted ? "on" : "off"}
      type={type ?? "button"}
      title={title ?? fullText(children)}
      className={cn(
        chipBase,
        "h-[38px] gap-1.5 bg-bg/60 font-semibold data-[state=on]:border-text data-[state=on]:bg-text data-[state=on]:text-bg",
        className,
      )}
      {...props}
    >
      {icon}
      <ChipLabel slot="header-chip-label">{children}</ChipLabel>
      {count !== undefined && count > 0 ? (
        <span
          data-slot="header-chip-badge"
          aria-hidden
          className={cn(
            "h-[18px] min-w-[18px] rounded-pill px-[5px] text-center text-[11px] leading-[18px] font-bold tabular-nums",
            highlighted ? "bg-bg text-text" : "bg-text text-bg",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export type FilterChipProps = Omit<ChipProps, "aria-pressed"> & {
  /** The option is part of the filter; exposed as `aria-pressed`. */
  pressed?: boolean;
};

/**
 * A chip that turns one option of a filter on or off (WP-23, legacy `fchip`): a plain button with `aria-pressed`.
 * The caller decides what a press does (for example, that the last housing type cannot be turned off).
 */
export function FilterChip({ pressed = false, icon, children, title, type, className, ...props }: FilterChipProps) {
  return (
    <button
      data-slot="filter-chip"
      aria-pressed={pressed}
      type={type ?? "button"}
      title={title ?? fullText(children)}
      className={cn(
        chipBase,
        "gap-1 bg-bg font-medium aria-pressed:border-text aria-pressed:bg-text aria-pressed:text-bg",
        className,
      )}
      {...props}
    >
      {icon}
      <ChipLabel slot="filter-chip-label">{children}</ChipLabel>
    </button>
  );
}
