"use client";

import type { ComponentProps } from "react";

import { cn } from "../cn";

/** The look of the number fields of the filters sheet (`IntInput`, `PriceInput`). */
export const numberFieldClass =
  "h-11 w-full min-w-0 rounded-medium border border-sep bg-fill px-3 text-[16px] text-text outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

export type IntInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "inputMode"> & {
  /** The whole number shown; `null` is an empty field. */
  value: number | null;
  /** Called with the digits of the text as a number, `null` for an empty field or 0, at most `max`. */
  onValueChange: (value: number | null) => void;
  /** The largest value; a bigger one is written as `max`. */
  max?: number;
};

/**
 * A whole-number field (WP-25, the area bounds of `03` §3.4): non-digits are dropped as they are typed, 0 means no
 * value, and a value above `max` becomes `max`. The text always follows `value`.
 */
export function IntInput({ value, onValueChange, max, className, ...props }: IntInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      enterKeyHint="done"
      autoComplete="off"
      data-slot="int-input"
      {...props}
      value={value === null ? "" : String(value)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D+/g, "");
        const parsed = digits === "" ? 0 : Number(digits);
        onValueChange(parsed === 0 ? null : max !== undefined ? Math.min(parsed, max) : parsed);
      }}
      className={cn(numberFieldClass, className)}
    />
  );
}
