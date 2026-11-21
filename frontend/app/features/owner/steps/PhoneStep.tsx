"use client";

import type { Locale } from "@homi/config";
import { labelFor } from "@homi/i18n";
import { Button, ShieldCheck } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { brand } from "@/lib/brand";
import { requestOwnerPhone } from "@/lib/actions/owner";
import { useAction } from "@/lib/actions/useAction";
import { botStartUrl } from "@/lib/deeplinks/build";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";
import { showToast } from "@/lib/ui/toast";

import { closeOwnerForm } from "../closeOwnerForm";
import { useOwnerForm } from "../form/context";
import { invalidateOwner, putOwnerListing } from "../store";
import { RejectionState } from "./RejectionState";
import { StepFrame } from "./StepFrame";
import { type PollEnd, usePhonePoll } from "./usePhonePoll";

type Attempt = "idle" | "waiting" | "denied" | "old" | "failed";

/**
 * `/owner/<id>/phone` (WP-81, SCR-053, BR-APP-084, TMA-034, LB-APP-060): a card with a shield, `own.phoneText` and
 * `own.phoneHow`; one line on how the number is kept (`own.phoneKept`, pending legal review, DEC-87) with the privacy
 * link; while waiting «Ждём номер от Telegram…»; an inline error for `phone_error`; the denied text; when late or on an
 * old client the block with «Открыть бот». A tap: the medium haptic, `requestOwnerPhone` (the bot's ten-minute window),
 * then `tg.requestContact()` — `null` (below 6.9) the old-client text and the poll anyway, `false` the denied text,
 * `true` the poll. The poll ends on `phone_set` (the mode step replaces this one), on `rejected` (the rejection state)
 * or on a `phone_error`. A `rejected` listing shows the rejection state here.
 */
export function PhoneStep() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const owner = useOwnerForm();
  const requestPhone = useAction(requestOwnerPhone);
  const [attempt, setAttempt] = useState<Attempt>("idle");
  const [error, setError] = useState<"not_uz" | "not_own" | null>(null);
  const id = owner?.listing.id ?? "";

  const onEnd = useCallback(
    (end: PollEnd) => {
      if (end.kind === "set") {
        tg.haptic.success();
        invalidateOwner();
        nav.replace(routes.ownerMode(id));
      } else if (end.kind === "rejected") {
        tg.haptic.error();
        setAttempt("idle");
      } else {
        tg.haptic.error();
        setError(end.error);
        setAttempt("idle");
      }
    },
    [id],
  );
  const poll = usePhonePoll(id, onEnd);

  if (owner === null) {
    return null;
  }
  const { listing } = owner;
  if (listing.status === "rejected") {
    return <RejectionState listing={listing} />;
  }
  const shownError = error ?? listing.phoneError;

  const share = async () => {
    tg.haptic.impact("medium");
    setError(null);
    const opened = await requestPhone({ id });
    if (!opened.ok) {
      if (opened.code === "owner_disabled") {
        showToast({ key: "own.disabled" });
        void closeOwnerForm();
        return;
      }
      tg.haptic.error();
      setAttempt("failed");
      return;
    }
    putOwnerListing(opened.data);
    const shared = await tg.requestContact();
    if (shared === false) {
      setAttempt("denied");
      return;
    }
    setAttempt(shared === null ? "old" : "waiting");
    poll.start(shownError);
  };

  const bot = botStartUrl("owner_phone");
  const privacy = brand.links.privacy[locale];
  const late = attempt === "old" || (poll.polling && poll.late) || (attempt === "waiting" && !poll.polling);

  return (
    <StepFrame onClose={() => nav.back()}
      step="phone"
      title={t("own.phoneTitle")}
      footer={
        <Button data-action="share-phone" onClick={() => void share()}>
          {t("own.sharePhone")}
        </Button>
      }
    >
      <div className="rounded-medium bg-fill p-4">
        <ShieldCheck size={28} aria-hidden className="text-accent" />
        <p className="mt-2 text-[15px] leading-[1.45] text-text">{t("own.phoneText")}</p>
        <p className="mt-2 text-[13px] leading-[1.4] text-hint">{t("own.phoneHow")}</p>
      </div>
      <p data-phone-kept="" data-legal-review="pending" className="mt-3 text-[13px] leading-[1.4] text-hint">
        {t("own.phoneKept")}
        {privacy === null ? null : (
          <>
            {" "}
            <a href={privacy} className="text-accent underline" onClick={(event) => {
              event.preventDefault();
              tg.openLink(privacy);
            }}>
              {t("settings.privacy")}
            </a>
          </>
        )}
      </p>
      {poll.polling && attempt === "waiting" && !poll.late ? (
        <p data-phone-state="waiting" role="status" className="mt-3 text-[14px] text-hint">
          {t("own.phoneWaiting")}
        </p>
      ) : null}
      {shownError === null ? null : (
        <p data-phone-error={shownError} role="alert" className="mt-3 text-[14px] leading-[1.4] text-danger">
          {t(labelFor("phoneError", shownError))}
        </p>
      )}
      {attempt === "denied" ? (
        <p data-phone-state="denied" role="status" className="mt-3 text-[14px] leading-[1.4] text-text">
          {t("own.phoneDenied")}
        </p>
      ) : null}
      {attempt === "failed" ? (
        <p data-phone-state="failed" role="alert" className="mt-3 text-[14px] leading-[1.4] text-danger">
          {t("own.actionOffline")}
        </p>
      ) : null}
      {late ? (
        <div data-phone-state={attempt === "old" ? "old" : "late"} className="mt-3 rounded-medium bg-fill p-3">
          <p className="text-[14px] leading-[1.4] text-text">{attempt === "old" ? t("own.phoneOldTg") : t("own.phoneLate")}</p>
          {bot === null ? null : (
            <Button variant="secondary" size="md" className="mt-2" data-action="open-bot" onClick={() => tg.openLink(bot)}>
              {t("own.openBot")}
            </Button>
          )}
        </div>
      ) : null}
    </StepFrame>
  );
}
