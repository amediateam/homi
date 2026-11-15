"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

import { cn } from "../cn";

/** Switch (shadcn/ui source on Radix Switch, restyled, WP-20). */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-pill bg-fill p-[2px] transition-colors duration-(--dur-fast) ease-(--ease-ios) outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[27px] rounded-pill bg-bg shadow-(--shadow-float) transition-transform duration-(--dur-fast) ease-(--ease-ios) data-[state=checked]:translate-x-5"
      />
    </SwitchPrimitive.Root>
  );
}
