"use client";

import { type ComponentProps, useState } from "react";

import { cn } from "../cn";
import { numberFieldClass } from "./IntInput";

export type PriceInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "inputMode"> & {
  /** The amount behind the field; `null` is no value. */
  value: number | null;
  /** Called with `parse` of the typed text on every change. */
  onValueChange: (value: number | null) => void;
  /** The text of an amount (`Money.toInput`). */
  toText: (value: number | null) => string;
  /** The amount of a text, `null` for empty or unreadable text (`Money.parseInput`). */
  parse: (text: string) => number | null;
  /** `decimal` for millions of сум, `numeric` for dollars. */
  inputMode: "decimal" | "numeric";
};

/**
 * A price field (WP-25, `03` §3.5) that knows no currency: `toText` and `parse` carry it. The field keeps the text as
 * typed — `1,` or `1.000.000` stay on screen — and takes the text of `value` only when `value` is no longer what the
 * text parses to: a preset, a reset or another currency. Text that does not parse means no value and stays as typed.
 */
export function PriceInput({ value, onValueChange, toText, parse, className, ...props }: PriceInputProps) {
  const [text, setText] = useState(() => toText(value));
  if (parse(text) !== value) {
    const synced = toText(value);
    if (synced !== text) {
      setText(synced);
    }
  }

  return (
    <input
      type="text"
      enterKeyHint="done"
      autoComplete="off"
      data-slot="price-input"
      {...props}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onValueChange(parse(event.target.value));
      }}
      className={cn(numberFieldClass, className)}
    />
  );
}
