"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

import { BUILD_VERSION } from "@/lib/analytics/buildVersion";
import { discard, flush } from "@/lib/analytics/journal";
import { captureOnce, initAnalytics } from "@/lib/analytics/posthog";
import { markAppStarted } from "@/lib/errors/report";
import { useSession } from "@/lib/session/SessionProvider";

/**
 * The start of the journal and of PostHog (WP-32): when the session is ready the queued events go (`flush`), error
 * reports carry `stage: 'app'` and PostHog may load with the profile's `analytics`; outside Telegram, refused or
 * expired, the queue is dropped (`discard`). An expiry is not an error report: PostHog alone gets `session_expired`,
 * once per launch.
 */
export function AnalyticsBoot(): null {
  const { status, me, mode } = useSession();
  const locale = useLocale();
  const ready = status === "ready" && me !== null;

  useEffect(() => {
    if (status === "outside" || status === "denied" || status === "expired") {
      discard();
      if (status === "expired") {
        captureOnce("session_expired");
      }
    }
  }, [status]);

  useEffect(() => {
    if (!ready || me === null) {
      return;
    }
    flush();
    markAppStarted();
    initAnalytics({
      key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      env: process.env.NEXT_PUBLIC_APP_ENV ?? "",
      build: BUILD_VERSION,
      locale,
      sessionMode: mode === "header" ? "header" : "cookie",
      me: { analytics: me.analytics, team: me.team },
    });
    // Once per ready session: a later profile change does not start PostHog again (`initAnalytics` runs once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return null;
}
