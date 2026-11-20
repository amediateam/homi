"use client";

import { X } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { subscribeSdk, webApp } from "@/lib/telegram/sdk";

const sdkAbsent = (): boolean => webApp() === null;

/**
 * The app's own close cross while the Telegram SDK is absent (WP-36, `05` TMA-047, legacy `FallbackClose` since
 * `index-CIa0Ldj2.js`): without the SDK Telegram's BackButton cannot be shown, so the listing layer (every state) and
 * every sub-page carry this one. The server snapshot renders nothing, so it appears after hydration only, and it goes
 * when the SDK arrives (`subscribeSdk`). A round glass button of 44 px, fixed 10 px under the top inset and 12 px from
 * the right, at 88 % opacity and z-index 3 of the layer it sits in, as legacy; inside a layer that moves (the
 * entrance, the leave, a swipe) it moves with the layer.
 */
export function FallbackClose({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const absent = useSyncExternalStore(subscribeSdk, sdkAbsent, () => false);
  if (!absent) {
    return null;
  }
  return (
    <button
      type="button"
      data-fallback-close=""
      aria-label={t("common.close")}
      onClick={() => onClose()}
      className="glass fixed top-[calc(var(--top-inset)+10px)] right-[12px] z-3 grid size-[44px] place-items-center rounded-pill text-text opacity-[0.88] shadow-(--shadow-float) outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
    >
      <X size={20} strokeWidth={2.25} aria-hidden />
    </button>
  );
}
