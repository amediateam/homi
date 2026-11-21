"use client";

import { labelFor } from "@homi/i18n";
import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";

import type { OwnerRequestAction } from "@/lib/actions/owner";

import { useChosenReason } from "./useAnswer";
import type { OwnerRequestView } from "./useOwnerRequests";

/**
 * One request of «Отклики» (WP-82, SCR-058, DEC-76): the seeker's first name as the server stored it, or «Без имени»;
 * «{who} · N чел. · въезд: {when}» («N чел.» only above 1, an unknown `who` → «Другое», LB-APP-064); the message in
 * «…». The name, the move-in text and the message carry `.ph-mask` (replay masks them) and never reach analytics.
 * A pending request: «Дать номер» and «Не подходит». Any other: its status line, then by the server's flags the reason
 * question (until a reason is chosen in this launch), the undo row, or «Оказался риелтором».
 */
export function RequestCard({ request, busy, onAnswer }: { request: OwnerRequestView; busy: boolean; onAnswer: (action: OwnerRequestAction) => void }) {
  const t = useTranslations();
  const reason = useChosenReason(request.id);
  const who = request.who === "" ? null : t(labelFor("requestWho", request.who));
  const people = request.people > 1 ? t("own.people", { n: request.people }) : null;
  const button = (action: OwnerRequestAction, label: string, variant: "primary" | "secondary" = "secondary") => (
    <Button key={action} type="button" size="sm" variant={variant} disabled={busy} data-action={action} onClick={() => onAnswer(action)}>
      {label}
    </Button>
  );

  let tail;
  if (request.status === "pending") {
    tail = (
      <div className="flex gap-[8px]">
        {button("give", t("own.give"), "primary")}
        {button("decline", t("own.decline"))}
      </div>
    );
  } else {
    const status = request.status === "given" && request.agentMarked ? t("own.req.givenAgent") : t(labelFor("requestStatus", request.status));
    tail = (
      <div className="flex flex-col gap-[8px]">
        <p data-request-status={request.status} className="text-[14px] font-semibold text-text">
          {status}
        </p>
        {reason === "found" ? <p className="text-[13px] text-hint">{t("own.whyFoundDone")}</p> : null}
        {request.canReason && reason === null ? (
          <div data-request-reasons="" className="flex flex-col gap-[8px]">
            <p className="text-[13px] leading-[1.4] text-hint">{t("own.why")}</p>
            <div className="flex flex-wrap gap-[8px]">
              {button("reason_found", t("own.whyFound"))}
              {button("reason_agent", t("own.whyAgent"))}
            </div>
          </div>
        ) : null}
        {request.canUndo ? (
          <div data-request-undo="" className="flex items-center justify-between gap-[8px]">
            <p className="text-[13px] leading-[1.4] text-hint">{t("own.undoHint")}</p>
            {button("undo", t("own.undo"))}
          </div>
        ) : request.canLate ? (
          <div>{button("late", t("own.lateAgent"))}</div>
        ) : null}
      </div>
    );
  }

  return (
    <article data-request={request.id} data-request-state={request.status} className="flex flex-col gap-[10px] rounded-[16px] bg-fill p-[14px]">
      <div className="flex flex-col gap-[2px]">
        <p className="ph-mask text-[16px] font-semibold text-text">{request.name ?? t("own.someone")}</p>
        <p className="text-[13px] text-hint">
          {[who, people].filter(Boolean).join(" · ")}
          {request.moveIn === null ? null : (
            <>
              {who !== null || people !== null ? " · " : ""}
              <span className="ph-mask">{t("own.moveIn", { when: request.moveIn })}</span>
            </>
          )}
        </p>
      </div>
      {request.message === null ? null : <p className="ph-mask text-[15px] leading-[1.45] text-text">«{request.message}»</p>}
      {tail}
    </article>
  );
}
