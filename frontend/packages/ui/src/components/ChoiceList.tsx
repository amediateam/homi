"use client";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";

export type ChoiceOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export type ChoiceListProps<T extends string> = Omit<
  ComponentProps<typeof RadioGroup>,
  "value" | "defaultValue" | "onValueChange" | "children"
> & {
  options: readonly ChoiceOption<T>[];
  /** The chosen option, or `null` while nothing is chosen yet. */
  value: T | null;
  /** Called with a newly chosen option; a tap on the chosen row calls nothing. */
  onValueChange: (value: T) => void;
};

/**
 * The rows of a settings sub-page with a ✓ on the chosen one (legacy `ChoiceList`), on the WP-20 `RadioGroup`:
 * 52 px rows, separators inset by 16 px. `disabled` turns off every row (while a choice is being saved).
 */
export function ChoiceList<T extends string>({
  options,
  value,
  onValueChange,
  className,
  ...props
}: ChoiceListProps<T>) {
  return (
    <RadioGroup
      data-slot="choice-list"
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined && option.value !== value) {
          onValueChange(option.value);
        }
      }}
      className={cn("divide-y-0", className)}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupItem
          key={option.value}
          data-slot="choice-list-item"
          value={option.value}
          disabled={option.disabled}
          className="relative min-h-[52px] px-3.5 active:bg-fill not-first:before:pointer-events-none not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:border-t-[0.5px] not-first:before:border-sep"
        >
          {option.label}
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}
