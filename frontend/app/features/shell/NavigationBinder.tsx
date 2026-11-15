"use client";

import { useEffect } from "react";

import { useUncountedRouter } from "@/i18n/CountedNavigation";
import { bindRouter } from "@/lib/navigation/nav";

/** Hands the next-intl router of the root layout to `nav`, so code outside components can navigate (WP-21). */
export function NavigationBinder(): null {
  const router = useUncountedRouter();
  useEffect(() => {
    bindRouter({
      push: (href, options) => router.push(href, options),
      replace: (href, options) => router.replace(href, options),
      back: () => router.back(),
    });
  }, [router]);
  return null;
}
