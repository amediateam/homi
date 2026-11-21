"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = Omit<
  ComponentProps<typeof RadioGroupPrimitive.Root>,
  "value" | "defaultValue" | "onValueChange" | "orientation" | "children"
> & {
  /** Two or three options, in equal columns. */
  options: readonly SegmentedOption<T>[];
  /** The selected option. The control is always controlled, so exactly one option is selected. */
  value: T;
  /** Called with another option's value; a tap on the selected option calls nothing. */
  onValueChange: (value: T) => void;
  /** `compact` is the glass control of the map top bar. */
  size?: "default" | "compact";
};

/** The selected option only changes its text: the thumb behind it carries the background (WP-39). */
const defaultItem = "h-[34px] text-hint data-[state=checked]:text-text";

/** The glass control of the map top bar: the selected option inverted over the thumb. */
const compactItem = "h-9 text-[14px] text-text opacity-60 data-[state=checked]:text-bg data-[state=checked]:opacity-100";

/** The control's padding and gap (px), which place the thumb: 3 and 3, in the compact control 4 and 4. */
const TRACK = { default: { pad: 3, gap: 3 }, compact: { pad: 4, gap: 4 } } as const;

/**
 * The thumb's look. Default: the background with a light shadow; in the dark scheme, where the background is black,
 * the `--sep` tint over the track instead, close to legacy's 18 % text mix (an arbitrary `color-mix()` would fall
 * back to the plain text colour, white on white, where `color-mix()` is missing). Compact: the text colour, so the
 * selected option reads inverted.
 */
const defaultThumb = "bg-bg shadow-[0_1px_4px_var(--sep)] [[data-scheme=dark]_&]:bg-sep [[data-scheme=dark]_&]:shadow-none";
const compactThumb = "bg-text";

/**
 * One of two or three options, as legacy `segmented` (the deal in the map top bar and the filters, the owner in the
 * quick filter). Built on Radix RadioGroup, so an option can never be deselected (D-UI-6) and the arrow keys move
 * the selection; a tap on the selected option does nothing. Haptics are the caller's `onValueChange`.
 *
 * The thumb (WP-39, BR-APP-121; legacy `.segmented:after`): one element behind the options, as wide as one of the
 * `n` equal columns, moved to the checked one by `translateX(k × (100 % + gap))` over 0.42 s on the release's spring;
 * transparent while nothing is checked. Legacy has no reduced-motion rule of its own for it; the one rule of
 * motion.css stops the slide there.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size = "default",
  className,
  ...props
}: SegmentedControlProps<T>) {
  const compact = size === "compact";
  const { pad, gap } = TRACK[size];
  const checked = options.findIndex((option) => option.value === value);
  const columns = Math.max(1, options.length);
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      data-size={size}
      orientation="horizontal"
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined && option.value !== value) {
          onValueChange(option.value);
        }
      }}
      className={cn(
        "relative grid auto-cols-fr grid-flow-col rounded-pill",
        compact ? "glass w-[210px] flex-none gap-1 p-1" : "gap-[3px] bg-fill p-[3px]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        data-slot="segmented-control-thumb"
        className={cn(
          "pointer-events-none absolute rounded-pill transition-[transform,opacity] duration-[420ms] ease-(--ease-spring)",
          compact ? compactThumb : defaultThumb,
          checked < 0 && "opacity-0",
        )}
        style={{
          top: pad,
          bottom: pad,
          left: pad,
          width: `calc((100% - ${2 * pad}px - ${(columns - 1) * gap}px) / ${columns})`,
          transform: `translateX(calc(${Math.max(0, checked)} * (100% + ${gap}px)))`,
        }}
      />
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          data-slot="segmented-control-item"
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "relative z-1 inline-flex min-w-0 items-center justify-center rounded-pill px-3 font-semibold whitespace-nowrap transition-[background-color,color,opacity,box-shadow] duration-(--dur-fast) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
            compact ? compactItem : defaultItem,
            !compact && (options.length > 2 ? "text-[13px]" : "text-[15px]"),
          )}
        >
          <span data-slot="segmented-control-label" className="truncate">
            {option.label}
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
