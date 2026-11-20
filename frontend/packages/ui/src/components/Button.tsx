import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../cn";

/**
 * Button (shadcn/ui source, restyled to the legacy look, WP-20). `primary` is the accent pill of the main actions,
 * 48 px high, at opacity 0.5 when disabled (legacy `.primary:disabled`, `03` §3.6); the other variants at 0.4.
 * Colours, radii and motion come from the tokens only.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap transition-[opacity,transform,background-color] duration-(--dur-fast) ease-(--ease-ios) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "rounded-pill bg-accent text-accent-text disabled:opacity-50",
        secondary: "rounded-pill bg-fill text-text",
        ghost: "rounded-medium bg-transparent text-text active:bg-fill",
        danger: "rounded-pill bg-fill text-danger",
        text: "rounded-small bg-transparent px-0 text-hint",
      },
      size: {
        lg: "h-12 px-6 text-[16px]",
        md: "h-10 px-4 text-[15px]",
        sm: "h-8 px-3 text-[13px]",
        icon: "size-10 p-0",
      },
    },
    compoundVariants: [{ variant: "text", size: ["lg", "md", "sm"], className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "lg" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child (a link, for example) with the button's look. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      data-variant={variant ?? "primary"}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
