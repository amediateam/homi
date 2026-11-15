"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { useHasStubData } from "@/lib/data/sources";

/**
 * The "demo data" pill (WP-20, `25` §4.4, RK-27, DEC-50): shown while an answer of the current screen came from a
 * stub. Fixed under the top inset on the trailing side, above the tab bar, never intercepting a tap.
 */
export function DemoDataMarker() {
  const t = useTranslations("demo");
  const hintId = useId();
  if (!useHasStubData()) {
    return null;
  }

  return (
    <div
      data-demo-marker=""
      aria-describedby={hintId}
      className="pointer-events-none fixed top-[calc(var(--top-inset)+6px)] right-(--gutter) z-[calc(var(--z-tabbar)+1)] rounded-pill bg-fill px-2.5 py-1 text-[12px] leading-none font-semibold text-hint select-none"
    >
      {t("label")}
      <span id={hintId} hidden>
        {t("hint")}
      </span>
    </div>
  );
}
