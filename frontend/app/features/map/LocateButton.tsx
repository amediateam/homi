"use client";

import { LocateFixed, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";

/**
 * "Where am I" (KV-FE-031): a round glass button named `map.locate`; while the position is asked for it shows a
 * spinner, is disabled and busy.
 */
export function LocateButton({ busy, onLocate }: { busy: boolean; onLocate: () => void }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      data-map-locate=""
      aria-label={t("map.locate")}
      aria-busy={busy}
      disabled={busy}
      onClick={onLocate}
      className="glass grid size-[44px] place-items-center rounded-pill text-text shadow-(--shadow-float) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:active:scale-100"
    >
      {busy ? <Spinner aria-hidden role="presentation" className="size-[18px]" /> : <LocateFixed size={20} aria-hidden />}
    </button>
  );
}
