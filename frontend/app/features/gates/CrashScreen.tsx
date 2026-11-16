"use client";

import { Button, EmptyState, RotateCw } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { brand } from "@/lib/brand";

import { useRenderReport } from "./useRenderReport";

/**
 * The crash screen (SCR-045), drawn by `[locale]/error.tsx` for a render error below the root layout: the neutral
 * shrug placeholder (D-E-1, no legacy artwork), `crash.title`, `crash.text` and a single action, «Обновить», which
 * reloads the document as legacy did — the boundary's `retry` would only render the same tree again, while a reload
 * starts the launch afresh. The error is reported once (`useRenderReport`). The title is the screen's heading, and
 * the action takes the focus: the screen replaces the subtree that may have held it.
 */
export function CrashScreen({ error }: { error: unknown }) {
  const t = useTranslations();
  const action = useRef<HTMLButtonElement>(null);
  useRenderReport(error);

  useEffect(() => {
    action.current?.focus({ preventScroll: true });
  }, []);

  return (
    <EmptyState
      role="alert"
      tall
      titleAs="h1"
      image={brand.assets.emptyShrug}
      title={t("crash.title")}
      hint={t("crash.text")}
      action={
        <Button ref={action} variant="secondary" className="px-4 text-[15px]" onClick={() => location.reload()}>
          <RotateCw size={16} aria-hidden />
          {t("crash.reload")}
        </Button>
      }
    />
  );
}
