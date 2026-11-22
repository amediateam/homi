"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useId } from "react";

import { useHasStubData } from "@/lib/data/sources";
import { matchRoute } from "@/lib/navigation/routes";

/**
 * The "demo data" pill (WP-20, `25` §4.4, RK-27, DEC-50): shown while an answer of the current screen came from a
 * stub. Fixed under the top inset on the trailing side, above the tab bar and the listing layer (46 over 45, WP-26)
 * but below the sheets' backdrop, never intercepting a tap. The screen outside Telegram shows no data at all, so it
 * has no pill although the layout's reference read reports `stub` there too (WP-33 journey 8).
 */
export function DemoDataMarker() {
  const t = useTranslations("demo");
  const hintId = useId();
  // Every address of the app is under its locale (`app/[locale]/`): the route is the rest.
  const route = matchRoute(usePathname().replace(/^\/[^/]+/, "") || "/");
  const stub = useHasStubData();
  if (!stub || (route.route === "gate" && route.gate === "outside")) {
    return null;
  }

  return (
    <div
      data-demo-marker=""
      aria-describedby={hintId}
      className="pointer-events-none fixed top-[calc(var(--top-inset)+6px)] right-(--gutter) z-[calc(var(--z-listing)+1)] rounded-pill bg-fill px-2.5 py-1 text-[12px] leading-none font-semibold text-hint select-none"
    >
      {t("label")}
      <span id={hintId} hidden>
        {t("hint")}
      </span>
    </div>
  );
}
