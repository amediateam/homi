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

/**
 * The selected option lifts off the track: the background with a light shadow. In the dark scheme, where the
 * background is black, it takes the `--sep` tint over the track instead, close to legacy's 18 % text mix; an
 * arbitrary `color-mix()` would fall back to the plain text colour (white on white) where `color-mix()` is missing.
 */
const defaultItem =
  "h-[34px] text-hint data-[state=checked]:bg-bg data-[state=checked]:text-text data-[state=checked]:shadow-[0_1px_4px_var(--sep)] [[data-scheme=dark]_&]:data-[state=checked]:bg-sep [[data-scheme=dark]_&]:data-[state=checked]:shadow-none";

/** The glass control of the map top bar: the selected option inverted. */
const compactItem =
  "h-9 text-[14px] text-text opacity-60 data-[state=checked]:bg-text data-[state=checked]:text-bg data-[state=checked]:opacity-100";

/**
 * One of two or three options, as legacy `segmented` (the deal in the map top bar and the filters, the owner in the
 * quick filter). Built on Radix RadioGroup, so an option can never be deselected (D-UI-6) and the arrow keys move
 * the selection; a tap on the selected option does nothing. Haptics are the caller's `onValueChange`.
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
        "grid auto-cols-fr grid-flow-col rounded-pill",
        compact ? "glass w-[210px] flex-none gap-1 p-1" : "gap-[3px] bg-fill p-[3px]",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          data-slot="segmented-control-item"
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "inline-flex min-w-0 items-center justify-center rounded-pill px-3 font-semibold whitespace-nowrap transition-[background-color,color,opacity,box-shadow] duration-(--dur-fast) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
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
