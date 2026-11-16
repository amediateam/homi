"use client";

import { isLocale, type Locale } from "@homi/config";
import { useLocale } from "next-intl";
import { useEffect } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE } from "@/i18n/routing";
import { matchRoute } from "@/lib/navigation/routes";
import { detectLocale, tg } from "@/lib/telegram";

import { useSession } from "./SessionProvider";

function storedLocale(): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.slice(LOCALE_COOKIE.length + 1) ?? "";
  return value !== "" ? value : null;
}

/**
 * Keeps the locale segment right (BR-APP-050, `25` §3.4 step 5). Before sign-in, while next-intl has no stored
 * locale, the Telegram language picks it (`detectLocale`, LB-APP-032); after sign-in `me.locale` wins and is checked
 * on every navigation, so Back cannot land on an old segment. next-intl's router stores the switched locale in its
 * cookie. It waits until the launch is prepared, because the fragment scrub would undo a pending navigation. The
 * first-launch choice itself is WP-23. On a gate route it does nothing: `GateRedirector` owns every navigation into
 * and out of the gates, with the locale it wants (WP-23, D-S-6), so a pick there navigates once.
 */
export function LocaleGuard(): null {
  const { status, prepared, me } = useSession();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!prepared || matchRoute(pathname).route === "gate") {
      return;
    }
    let wanted: Locale | null = null;
    if (status === "ready" && me !== null && isLocale(me.locale)) {
      wanted = me.locale;
    } else if (status === "booting" && tg.hasInitData() && storedLocale() === null) {
      wanted = detectLocale(tg.languageCode());
    }
    if (wanted !== null && wanted !== locale) {
      router.replace(`${pathname}${window.location.search}`, { locale: wanted });
    }
  }, [status, prepared, me, locale, pathname, router]);

  return null;
}
