"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

import { cn } from "../cn";

/**
 * Switch (shadcn/ui source on Radix Switch, restyled, WP-20), in legacy `.switch` pixels: a 51 × 31 track with 2 px
 * of padding and a 27 px thumb, so the thumb travels 20 px. Off, the track is `--sep` (the text colour at 10 %, 14 %
 * in the dark scheme; legacy mixed 16 %) — not `--fill`, which the tiles and cards it sits on already are, and not an
 * arbitrary `color-mix()`, whose fallback without `color-mix()` is the plain text colour — and the thumb is light in
 * every scheme: the background in the light ones, the text colour in the dark one, where the background is black
 * (WP-30). On, the track is the brand accent and the thumb its own text colour, which stands out on the yellow in every
 * scheme.
 */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-pill bg-sep p-[2px] transition-colors duration-(--dur-fast) ease-(--ease-ios) outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[27px] rounded-pill bg-bg shadow-(--shadow-float) transition-[translate,background-color] duration-(--dur-fast) ease-(--ease-ios) data-[state=checked]:translate-x-[20px] data-[state=checked]:bg-accent-text [[data-scheme=dark]_&]:data-[state=unchecked]:bg-text"
      />
    </SwitchPrimitive.Root>
  );
}
