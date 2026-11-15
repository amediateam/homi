import type { ComponentProps } from "react";

import { cn } from "../cn";

/** The legacy ring spinner; reduced motion stops it (motion.css), WP-20. Pass `aria-label` where it is the only content. */
export function Spinner({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="spinner"
      data-spinner=""
      role="status"
      className={cn(
        "inline-block size-5 animate-spin rounded-pill border-2 border-sep border-t-current text-hint",
        className,
      )}
      {...props}
    />
  );
}
