"use client";

import type { Locale } from "@homi/config";
import { formatResponseTime } from "@homi/i18n/format";
import { Button, cn, Minus, Plus } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { RouteSheet, type RoutePresentation } from "@/features/shell/RouteSheet";
import { useBack } from "@/lib/navigation/useBack";
import { useCloseOnce } from "@/lib/navigation/useCloseOnce";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import type { ListingDetails } from "../listingData";
import { EMPTY_DRAFT, MESSAGE_MAX, MOVE_IN_MAX, pickWho, PEOPLE_MAX, PEOPLE_MIN, stepPeople, WHO_DEFAULTS } from "./requestForm";
import { useContactRequest } from "./useContactRequest";

/**
 * «Отклик хозяину» (WP-83, SCR-061, BR-APP-099, DEC-52, DEC-76, DEC-87): the lead with the owner's usual time; «Кто
 * будет жить» (five chips, none picked), «Сколько человек» (1 … 20; a chip sets its count only while untouched),
 * «Въезд» (32), «Сообщение» (500, prefilled); the note with the day's limit — and for a listing read from legacy the
 * relay line — marked "pending legal review" (DEC-87); the footer «Выберите, кто будет жить» until a chip, then
 * «Отправить хозяину», disabled while sending. No number is asked for or shown. The fields carry `.ph-mask`; typed text
 * is lost on close, as legacy. Closes by the backdrop, «×», a drag and Back; a sent request closes it.
 */
export function ContactRequestSheet({ details, presentation }: { details: ListingDetails; presentation: RoutePresentation }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { back } = useBack();
  const close = useCloseOnce(back);
  const { requestLimits } = useReference();
  const [draft, setDraft] = useState(() => ({ ...EMPTY_DRAFT, message: t("contact.messageDefault") }));
  const { submit, sending, line } = useContactRequest(details, close);
  const minutes = details.owner?.response_minutes ?? null;
  const relayed = details.origin === "legacy";

  return (
    <RouteSheet
      presentation={presentation}
      variant="full"
      title={t("contact.title")}
      onClose={close}
      footer={
        <div className="flex flex-col gap-[8px] px-(--gutter) pb-[8px]">
          {line === null ? null : (
            <p data-request-line={line.key} role="alert" className="text-center text-[14px] leading-[1.4] text-danger">
              {t(line.key, line.values)}
            </p>
          )}
          <Button data-action="send-request" disabled={draft.who === null || sending} onClick={() => void submit(draft)} className="h-[48px] w-full text-[16px]">
            {draft.who === null ? t("contact.pickWho") : t("contact.send")}
          </Button>
        </div>
      }
    >
      <div data-route="listing/contact" className="flex flex-col gap-[16px] px-(--gutter) pb-[12px]">
        <p className="text-[15px] leading-[1.45] text-hint">
          {minutes === null ? t("contact.leadNoTime") : t("contact.leadTime", { time: formatResponseTime(minutes, locale) })}
        </p>

        <fieldset className="flex flex-col gap-[8px]">
          <legend className="mb-[8px] text-[14px] font-semibold text-text">{t("contact.who._")}</legend>
          <div role="radiogroup" aria-label={t("contact.who._")} className="flex flex-wrap gap-[8px]">
            {WHO_DEFAULTS.map(({ who }) => (
              <button
                key={who}
                type="button"
                role="radio"
                aria-checked={draft.who === who}
                data-who={who}
                onClick={() => {
                  tg.haptic.impact("light");
                  setDraft((current) => pickWho(current, who));
                }}
                className={cn("rounded-pill border px-[14px] py-[8px] text-[15px]", draft.who === who ? "border-accent bg-accent text-accent-text" : "border-sep bg-fill text-text")}
              >
                {t(`contact.who.${who}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-text">{t("contact.people")}</span>
          <div className="flex items-center gap-[12px]" data-people={draft.people}>
            <button type="button" aria-label="−" data-action="people-less" disabled={draft.people <= PEOPLE_MIN} onClick={() => setDraft((current) => stepPeople(current, -1))} className="grid size-[36px] place-items-center rounded-full bg-fill disabled:opacity-40">
              <Minus size={18} aria-hidden />
            </button>
            <span className="min-w-[24px] text-center text-[17px] font-semibold tabular-nums">{draft.people}</span>
            <button type="button" aria-label="+" data-action="people-more" disabled={draft.people >= PEOPLE_MAX} onClick={() => setDraft((current) => stepPeople(current, 1))} className="grid size-[36px] place-items-center rounded-full bg-fill disabled:opacity-40">
              <Plus size={18} aria-hidden />
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-[6px]">
          <span className="text-[14px] font-semibold text-text">{t("contact.moveIn")}</span>
          <input
            data-field="move_in"
            value={draft.moveIn}
            maxLength={MOVE_IN_MAX}
            placeholder={t("contact.moveInPh")}
            onChange={(event) => setDraft((current) => ({ ...current, moveIn: event.target.value }))}
            className="ph-mask h-[44px] rounded-[12px] bg-fill px-[12px] text-[16px] text-text outline-none"
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className="text-[14px] font-semibold text-text">{t("contact.message")}</span>
          <textarea
            data-field="message"
            rows={3}
            value={draft.message}
            maxLength={MESSAGE_MAX}
            onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
            className="ph-mask resize-none rounded-[12px] bg-fill px-[12px] py-[10px] text-[16px] text-text outline-none"
          />
        </label>

        <p data-request-note="" data-legal-review="pending" className="text-[13px] leading-[1.4] text-hint">
          {t("contact.noteLimit", { day: requestLimits.day })}
          {relayed ? ` ${t("contact.noteRelay")}` : null}
        </p>
      </div>
    </RouteSheet>
  );
}
