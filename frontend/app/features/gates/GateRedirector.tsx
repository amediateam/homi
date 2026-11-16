"use client";

import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { launchPending, releaseLaunchGate, setLaunchGate } from "@/lib/deeplinks/launch";
import { resetDepth } from "@/lib/navigation/history";
import { matchRoute } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { useSession } from "@/lib/session/SessionProvider";
import { detectLocale, tg } from "@/lib/telegram";

import { gateState, isGatePending } from "./gateState";
import { resolveGate } from "./resolveGate";
import { useBootRetry } from "./useBootRetry";

/**
 * Sends the launch through the gates (WP-23, `03` §1.4): on every change of the session, `me`, the reference data
 * or the address it asks `resolveGate` where the address must be, and owns every navigation into and out of a gate
 * route (D-S-6). A navigation is a replace with the target's locale — the counted router of `@/i18n/navigation`,
 * since `nav` cannot switch the locale — followed by `resetDepth`, so BackButton stays hidden on a gate. A target is
 * issued once per address it was issued from: a re-render while the navigation is on its way issues nothing, and an
 * address that changed meanwhile without reaching it is sent again.
 *
 * Entering a gate from the app remembers the address with its query (`gateState.returnTo`, D-S-7); row 7 returns to
 * it. The launch redirect of WP-21 waits while the language gate is pending or a gate page is shown (`setLaunchGate`)
 * and is released once the address is back in the app, because it pushes over the address it finds; it is mounted
 * after this component, so a decision here reads `launchPending()` before the redirect consumes the launch. Like the
 * locale guard it waits until the launch is prepared: the fragment scrub would undo a navigation made before. Runs
 * the boot retry (`useBootRetry`), whose single instance this is. Reads the search parameters, so it renders inside
 * `<Suspense>`.
 */
export function GateRedirector(): null {
  const { status, prepared, me, reason } = useSession();
  const locale = useLocale();
  const pathname = usePathname();
  const query = useSearchParams()?.toString() ?? "";
  const citiesCount = useReference().cities.length;
  const router = useRouter();
  const issued = useRef<string | null>(null);

  useBootRetry();

  useEffect(() => {
    setLaunchGate(() => !isGatePending());
    return () => setLaunchGate(() => true);
  }, []);

  useEffect(() => {
    if (!prepared) {
      return;
    }
    const matched = matchRoute(pathname);
    const gate = matched.route === "gate" ? matched.gate : null;
    const address = query === "" ? pathname : `${pathname}?${query}`;

    const left = gateState.onGate && gate === null;
    gateState.onGate = gate !== null;
    // A gate journey ends when the address is back in the app: the next one remembers its own address.
    if (left) {
      gateState.returnTo = null;
    }

    const decision = resolveGate({
      status,
      me,
      reason,
      locale,
      pathname,
      searchParams: new URLSearchParams(query),
      citiesCount,
      localePicked: gateState.localePicked,
      cityPicked: gateState.cityPicked,
      launchPending: launchPending(),
      telegramLocale: detectLocale(tg.languageCode(), { oneDetector: true }),
      returnTo: gateState.returnTo,
    });
    if (decision === null || decision === "expired") {
      issued.current = null;
      // Back in the app: the launch redirect may push over this address now (`launchPending()` was read above).
      if (left) {
        releaseLaunchGate();
      }
      return;
    }
    const key = `${locale}${address} → ${decision.locale}${decision.href}`;
    if (issued.current === key) {
      return;
    }
    issued.current = key;
    if (gate === null) {
      gateState.returnTo = address;
    }
    router.replace(decision.href, { locale: decision.locale });
    resetDepth(decision.href);
  }, [prepared, status, me, reason, locale, pathname, query, citiesCount, router]);

  return null;
}
