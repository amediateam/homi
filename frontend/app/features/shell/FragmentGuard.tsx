"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

import { usePathname } from "@/i18n/navigation";
import { useSession } from "@/lib/session/SessionProvider";
import { scrubLaunchFragment } from "@/lib/telegram";

/**
 * Keeps the launch data out of the address for the whole launch (TMA-009). The App Router keeps the address of its
 * first history entry, fragment included, and can bring it back on a later navigation (measured on a locale switch
 * after sign-in); after every navigation the fragment is removed again. Once the launch is prepared only, because
 * the SDK reads the fragment when it loads.
 */
export function FragmentGuard(): null {
  const { prepared } = useSession();
  // next-intl's pathname has no locale, so a locale switch shows only in `useLocale`.
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    if (prepared && /[#&]tgWebApp/.test(window.location.hash)) {
      scrubLaunchFragment();
    }
  }, [prepared, pathname, locale]);

  return null;
}
