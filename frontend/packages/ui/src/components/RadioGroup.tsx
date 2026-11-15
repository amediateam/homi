"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../cn";

/**
 * A list of options with a check mark on the chosen one — the settings sub-pages and the sort sheet (shadcn/ui
 * source on Radix RadioGroup, restyled, WP-20).
 */
export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("flex flex-col divide-y divide-sep", className)}
      {...props}
    />
  );
}

export function RadioGroupItem({ className, children, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "flex min-h-12 w-full items-center justify-between gap-3 bg-transparent px-(--gutter) text-left text-text outline-none focus-visible:bg-fill disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" className="text-text">
        <Check className="size-5" strokeWidth={2.5} aria-hidden />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
