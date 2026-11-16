"use client";

import { ErrorState } from "@homi/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useBootRetryState } from "./bootRetryStore";

/**
 * What a gate page shows while the session is not in the state the page is for (WP-23): its quiet placeholder
 * (`children` — skeletons only, or nothing: no text, no spinner), or, once the sixth sign-in attempt failed (D-S-3),
 * `ErrorState` with «Повторить», as the shell's content area does. Gate rows 1 to 4 decide where such a session
 * belongs; the page waits.
 */
export function GateWait({ children }: { children?: ReactNode }) {
  const t = useTranslations();
  const { failed, kind, retry } = useBootRetryState();
  if (failed && kind !== null) {
    return (
      <ErrorState
        tall
        kind={kind}
        title={kind === "offline" ? t("error.offline") : t("common.loadFailed")}
        text={kind === "offline" ? t("error.offlineText") : t("error.serverText")}
        retryLabel={t("error.retry")}
        onRetry={retry}
      />
    );
  }
  return (
    <div data-gate-wait="" aria-busy="true" className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
