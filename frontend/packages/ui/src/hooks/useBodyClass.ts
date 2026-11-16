"use client";

import { useEffect } from "react";

/** How many mounted holders keep each class on `<body>`. */
const holders = new Map<string, number>();

/**
 * Keeps `className` on `<body>` while `active` (WP-23, `03` §1.2). Counted per class name across every caller, so
 * two stacked sheets keep `sheet-open` until both have closed, and an unmount takes its share away exactly once.
 * Generic on purpose: the sheets hold `sheet-open` and `locked`, the listing layer of WP-26 holds `listing-open`,
 * and pull-to-refresh reads all three. A hidden route runs its effect cleanups, so it lets go of the class too.
 */
export function useBodyClass(className: string, active = true): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const body = document.body;
    holders.set(className, (holders.get(className) ?? 0) + 1);
    body.classList.add(className);
    return () => {
      const left = (holders.get(className) ?? 1) - 1;
      if (left > 0) {
        holders.set(className, left);
        return;
      }
      holders.delete(className);
      body.classList.remove(className);
    };
  }, [className, active]);
}
