"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../cn";

/** The chip look of a toggle (shadcn/ui `toggleVariants`, restyled, WP-20). */
export const toggleVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill font-semibold whitespace-nowrap transition-colors duration-(--dur-fast) outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        chip: "bg-fill text-text data-[state=on]:bg-text data-[state=on]:text-bg",
        accent: "bg-fill text-text data-[state=on]:bg-accent data-[state=on]:text-accent-text",
      },
      size: {
        md: "h-9 px-3.5 text-[14px]",
        sm: "h-7 px-2.5 text-[13px]",
      },
    },
    defaultVariants: { variant: "chip", size: "md" },
  },
);

/** A row of chips of which one or several are on (shadcn/ui source on Radix ToggleGroup, restyled). */
export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  );
}
