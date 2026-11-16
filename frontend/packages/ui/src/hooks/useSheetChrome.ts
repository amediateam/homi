"use client";

import { type RefObject, useEffect } from "react";

/**
 * Sticky chrome of a sheet (WP-23, legacy filters sheet): writes the heights of the header and the footer to
 * `--fsheet-head` and `--fsheet-foot` on the sheet, so its body can pad and scroll under the glass chrome and a toast
 * inside the sheet can sit above the footer. A missing header or footer counts as `0px`. A `ResizeObserver` keeps
 * the values current (a title that wraps, a footer hint that appears); without one they are measured once.
 *
 * The elements are read when the effect runs: pass a `layoutKey` that changes when the header or the footer
 * appears or disappears, so the new element is measured and observed. A passive effect, not a layout one: called
 * inside the sheet, a layout effect runs before React has attached the sheet's own ref. A sheet mounts in a
 * synchronous render (the portal's), whose passive effects still run before the first paint, and it rises from
 * below the screen in any case.
 */
export function useSheetChrome(
  sheetRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
  footerRef: RefObject<HTMLElement | null>,
  layoutKey?: unknown,
): void {
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return undefined;
    }
    const header = headerRef.current;
    const footer = footerRef.current;
    const measure = () => {
      sheet.style.setProperty("--fsheet-head", `${header?.offsetHeight ?? 0}px`);
      sheet.style.setProperty("--fsheet-foot", `${footer?.offsetHeight ?? 0}px`);
    };
    measure();
    if (typeof ResizeObserver !== "function") {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    for (const element of [header, footer]) {
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [sheetRef, headerRef, footerRef, layoutKey]);
}
