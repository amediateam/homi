import type { ComponentProps } from "react";

import { cn } from "../cn";

/** Loading placeholder with the legacy shimmer; reduced motion stops it (motion.css), WP-20. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      data-shimmer=""
      aria-hidden
      className={cn(
        "animate-shimmer rounded-medium bg-[linear-gradient(90deg,var(--fill)_25%,var(--sep)_50%,var(--fill)_75%)] bg-size-[400%_100%]",
        className,
      )}
      {...props}
    />
  );
}
