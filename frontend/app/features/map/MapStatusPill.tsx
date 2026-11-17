"use client";

import { cn, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";

import type { UiError } from "@/lib/api/errors";

import type { MapPointsStatus } from "./useMapPoints";

const PILL =
  "glass pointer-events-auto flex h-[36px] max-w-full items-center gap-[8px] rounded-pill px-[14px] text-[13px] font-semibold text-text shadow-(--shadow-float)";

export interface MapStatusPillProps {
  status: MapPointsStatus;
  error: UiError | null;
  onRetry: () => void;
}

/**
 * The state of the map's points over the map (SCR-011): a spinner named `map.loading` while nothing is drawn yet
 * (fix of LB-APP-044), `map.empty` when the search has nothing, «Не загрузилось» or «Нет связи» with «Повторить» on
 * a failure (fix of LB-APP-008); nothing once the pins are there.
 */
export function MapStatusPill({ status, error, onRetry }: MapStatusPillProps) {
  const t = useTranslations();
  switch (status) {
    case "ready":
      return null;
    case "loading":
      return (
        <div data-map-status="loading" className={PILL}>
          <Spinner aria-label={t("map.loading")} className="size-[16px]" />
        </div>
      );
    case "empty":
      return (
        <div data-map-status="empty" role="status" className={PILL}>
          {t("map.empty")}
        </div>
      );
    case "error":
      return (
        <div data-map-status="error" data-error={error ?? undefined} role="status" className={cn(PILL, "pr-[4px]")}>
          <span className="truncate">{error === "offline" ? t("error.offline") : t("common.loadFailed")}</span>
          <button
            type="button"
            onClick={onRetry}
            className="h-[28px] shrink-0 rounded-pill bg-accent px-[12px] text-[13px] font-semibold text-accent-text outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
          >
            {t("error.retry")}
          </button>
        </div>
      );
  }
}
