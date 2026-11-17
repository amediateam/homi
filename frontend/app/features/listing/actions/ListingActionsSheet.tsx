"use client";

import type { MessageKey } from "@homi/i18n";
import { Ban, buttonVariants, ChevronLeft, cn, EyeOff, Flag, LifeBuoy } from "@homi/ui";
import { useTranslations } from "next-intl";

import type { ListingAuthor } from "@/features/listing/listingData";
import { RouteSheet } from "@/features/shell/RouteSheet";
import { ToastHost } from "@/features/shell/ToastHost";

import { ActionRow } from "./ActionRow";
import { ReportDetailStep } from "./ReportDetailStep";
import type { ListingActions } from "./useListingActions";

/** BR-APP-037: from this many listings of the author the block hint says how many it hides. */
export const BLOCK_COUNT_FROM = 20;

export type ActionsStep = "menu" | "report" | "detail";

/** The title of each step, which is also the dialog's accessible name. */
const TITLES: Readonly<Record<ActionsStep, MessageKey>> = {
  menu: "actions.title",
  report: "report.title",
  detail: "report.detailTitle",
};

export interface ListingActionsSheetProps {
  step: ActionsStep;
  /** The listing's author; `null` while the details are on their way (the generic block hint). */
  author: ListingAuthor | null;
  /** `false` (not from an owner) hides «Это риелтор, а не хозяин»; `null` keeps it. */
  isOwner: boolean | null;
  /** `bot.support_username` of the reference data; `null` hides the support row. */
  supportUsername: string | null;
  actions: ListingActions;
  /** «Пожаловаться» and «Неверные данные»: the route pushes the step (with the light haptic). */
  onOpenStep: (step: "report" | "detail") => void;
  /** The chevron of the report and detail steps: one step back, as Telegram's Back. */
  onBack: () => void;
  /** `dev010RealtorVoteWording`: the review wording of the realtor hint. */
  agentReview: boolean;
}

/**
 * The actions sheet of the listing (SCR-023, BR-APP-036, BR-APP-037): a compact `RouteSheet` over the listing with
 * three steps — the menu, «Что не так?» and «Что именно неверно?». The title follows the step; the report and detail
 * steps put a back chevron left of it. The ×, the backdrop and the drag close every step at once (`actions.close`);
 * Telegram's Back and the chevron go one step. While a request runs every row is disabled. Failures show in the
 * sheet's own toast host (D-6). Portalled to `body` in both trees, so it has no server HTML.
 */
export function ListingActionsSheet({ step, author, isOwner, supportUsername, actions, onOpenStep, onBack, agentReview }: ListingActionsSheetProps) {
  const t = useTranslations();
  const { busy } = actions;
  // By the author's kind, the label as the server gives it (never an added `@`); the count from 20 listings.
  const kindHint =
    author?.kind === "phone"
      ? t("actions.blockHintPhone", { label: author.label })
      : author?.kind === "source"
        ? t("actions.blockHintSource", { label: author.label })
        : t("actions.blockHint");
  const blockHint = author !== null && author.count >= BLOCK_COUNT_FROM ? `${kindHint} — ${t("actions.blockCount", { n: author.count })}` : kindHint;

  const back =
    step === "menu" ? undefined : (
      <button
        type="button"
        data-sheet-back=""
        aria-label={t("actions.back")}
        onClick={onBack}
        className={cn(buttonVariants({ variant: "secondary", size: "icon" }), "size-9")}
      >
        <ChevronLeft className="size-5" strokeWidth={2.25} aria-hidden />
      </button>
    );

  return (
    <RouteSheet presentation="layer" variant="compact" title={t(TITLES[step])} closeLabel={t("common.close")} leading={back} onClose={actions.close}>
      <div data-route="listing/actions" data-step={step} aria-busy={busy} className="flex flex-col px-(--gutter)">
        {step === "menu" ? (
          <>
            <ActionRow action="hide" icon={EyeOff} title={t("actions.hide")} hint={t("actions.hideHint")} disabled={busy} onSelect={actions.hide} />
            <ActionRow
              action="block"
              icon={Ban}
              title={t("actions.block")}
              hint={blockHint}
              maskHint={author?.kind === "phone"}
              disabled={busy}
              onSelect={actions.block}
            />
            <ActionRow
              action="report"
              icon={Flag}
              title={t("actions.report")}
              hint={t("actions.reportHint")}
              arrow
              disabled={busy}
              onSelect={() => onOpenStep("report")}
            />
            {supportUsername !== null ? (
              <ActionRow
                action="support"
                icon={LifeBuoy}
                title={t("actions.support")}
                hint={t("actions.supportHint")}
                disabled={busy}
                onSelect={() => actions.support(supportUsername)}
              />
            ) : null}
          </>
        ) : step === "report" ? (
          <>
            <ActionRow action="rented" title={t("report.rented")} hint={t("report.rentedHint")} disabled={busy} onSelect={() => actions.report("rented")} />
            {isOwner === false ? null : (
              <ActionRow
                action="agent"
                title={t("report.agent")}
                hint={t(agentReview ? "report.agentHintReview" : "report.agentHint")}
                disabled={busy}
                onSelect={() => actions.report("agent")}
              />
            )}
            <ActionRow
              action="wrong_data"
              title={t("report.wrong_data")}
              hint={t("report.wrong_dataHint")}
              arrow
              disabled={busy}
              onSelect={() => onOpenStep("detail")}
            />
            <ActionRow action="fraud" title={t("report.fraud")} hint={t("report.fraudHint")} disabled={busy} onSelect={() => actions.report("fraud")} />
          </>
        ) : (
          <ReportDetailStep disabled={busy} onDetail={actions.reportDetail} />
        )}
      </div>
      <ToastHost scope="sheet" />
    </RouteSheet>
  );
}
