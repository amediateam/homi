"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Whether a scroll area is scrolled: a sentinel over its top 2 px has left the area's viewport (`SubPageFrame`'s
 * header separator; the owner form's frame, WP-81). Without IntersectionObserver it stays `false`.
 */
export function useScrolled(rootRef: RefObject<HTMLElement | null>, sentinelRef: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) {
          setScrolled(!entry.isIntersecting);
        }
      },
      { root },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rootRef, sentinelRef]);

  return scrolled;
}
