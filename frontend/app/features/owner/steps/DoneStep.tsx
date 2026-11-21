"use client";

import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useRadarsEnabled } from "@/features/radars/capability";

import { closeOwnerForm, openMyListings } from "../closeOwnerForm";
import { demandLine, useDemand } from "../demand/useDemand";
import { useOwnerForm } from "../form/context";
import { Celebration } from "./Celebration";
import { doneKindOf } from "./doneKind";
import { StepFrame } from "./StepFrame";

/**
 * `/owner/<id>/done` (WP-81, SCR-056, BR-APP-096): a new listing — the celebration, `own.doneText` (or
 * `own.doneTextNoRadar` with radars off), the demand line and `own.doneNext`; an edit — «Сохранили» and «Объявление
 * обновлено.», confetti only after a mascot tap; a held publish — «На проверке» and its text, no confetti, no haptics,
 * no demand line and never a reason. Footer «Мои объявления» and «Готово»; «Готово», Back and the swipe close the form.
 */
export function DoneStep() {
  const t = useTranslations();
  const owner = useOwnerForm();
  const radars = useRadarsEnabled();
  const demand = useDemand(owner?.listing.form ?? ({ city: null } as never));
  if (owner === null) {
    return null;
  }
  const { listing } = owner;
  const kind = doneKindOf(listing.id, listing.held);
  const line = kind === "new" ? demandLine(demand) : null;
  const footer = (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" data-action="mine" onClick={() => void openMyListings()}>
        {t("own.mine")}
      </Button>
      <Button data-action="done-close" onClick={() => void closeOwnerForm()}>
        {t("own.doneClose")}
      </Button>
    </div>
  );

  if (kind === "held") {
    return (
      <StepFrame onClose={() => void closeOwnerForm()} step="done" title={t("own.review.title")} footer={footer}>
        <p data-done="held" className="text-[15px] leading-[1.45] text-text">
          {t("own.review.text")}
        </p>
      </StepFrame>
    );
  }
  if (kind === "edit") {
    return (
      <StepFrame onClose={() => void closeOwnerForm()} step="done" title={t("own.savedTitle")} footer={footer}>
        <Celebration auto={false} />
        <p data-done="edit" className="text-center text-[15px] leading-[1.45] text-text">
          {t("own.savedText")}
        </p>
      </StepFrame>
    );
  }
  return (
    <StepFrame onClose={() => void closeOwnerForm()} step="done" title={t("own.doneTitle")} footer={footer}>
      <Celebration auto />
      <p data-done="new" className="text-center text-[15px] leading-[1.45] text-text">
        {radars ? t("own.doneText") : t("own.doneTextNoRadar")}
      </p>
      {line === null ? null : (
        <p data-done-demand="" className="mt-2 text-center text-[14px] text-hint">
          {line.kind === "few" ? t("own.demandFew") : t("own.demand", { n: line.n })}
        </p>
      )}
      <p className="mt-3 text-center text-[13px] leading-[1.4] text-hint">{t("own.doneNext")}</p>
    </StepFrame>
  );
}
