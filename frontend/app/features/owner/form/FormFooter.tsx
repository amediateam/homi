"use client";

import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * The questionnaire's footer (SCR-052): the first note that applies (the caller picks it: «Заполните: …» after a
 * refused «Дальше», `own.floorBad`, the save-failed text, the demand line), then «Мои объявления» when the listing is
 * locked, then «Дальше: подтвердить номер», or «Дальше» when `phone_set`, disabled while busy or uploading.
 */
export function FormFooter({
  note,
  locked,
  phoneSet,
  busy,
  onNext,
  onMine,
}: {
  note: ReactNode;
  locked: boolean;
  phoneSet: boolean;
  busy: boolean;
  onNext: () => void;
  onMine: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-2">
      {note === null ? null : (
        <p data-footer-note="" role="status" className="text-center text-[13px] leading-[1.4] text-hint">
          {note}
        </p>
      )}
      {locked ? (
        <Button variant="secondary" data-action="mine" onClick={onMine}>
          {t("own.mine")}
        </Button>
      ) : (
        <Button data-action="next" disabled={busy} onClick={onNext}>
          {phoneSet ? t("own.next") : t("own.nextPhone")}
        </Button>
      )}
    </div>
  );
}
