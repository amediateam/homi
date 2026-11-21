"use client";

import { cn, numberFieldClass } from "@homi/ui";
import type { ComponentProps } from "react";

export interface NumberTextFieldProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** The text as typed: «45,5» or «5/9» stays as it is; `rules.ts` parses it. */
  value: string;
  onValueChange: (text: string) => void;
  /** At most six characters, seven for the floor (`03` BR-APP-080). */
  maxLength: number;
  inputMode: "decimal" | "text";
}

/**
 * The text field of «Площадь» (`inputMode="decimal"`, a comma works) and «Этаж» (`inputMode="text"`, for «5/9»): it
 * keeps the text as typed, with the look of `numberFieldClass`. `IntInput` would drop the comma and the slash.
 */
export function NumberTextField({ value, onValueChange, maxLength, inputMode, className, ...props }: NumberTextFieldProps) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      value={value}
      maxLength={maxLength}
      onChange={(event) => onValueChange(event.target.value.slice(0, maxLength))}
      className={cn(numberFieldClass, className)}
      {...props}
    />
  );
}
