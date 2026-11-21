"use client";

import { Button, cn, SaveState, saveButtonProps, useSavePhase } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { publishOwnerListing, setContactMode, type ContactMode } from "@/lib/actions/owner";
import { useAction } from "@/lib/actions/useAction";
import { bffFetch } from "@/lib/api/browser";
import { readResource } from "@/lib/data/useResource";
import { currentAddress } from "@/lib/navigation/address";
import { closeThen } from "@/lib/navigation/closeThen";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";
import { showToast } from "@/lib/ui/toast";

import { closeOwnerForm, openMyListings } from "../closeOwnerForm";
import { useOwnerForm } from "../form/context";
import { normalizeOwnerListing } from "../normalize";
import { invalidateOwner, type OwnerListingBody, ownerListingKey, putOwnerListing } from "../store";
import { recordDone } from "./doneKind";
import { ListingPreview } from "./ListingPreview";
import { StepFrame } from "./StepFrame";

type FooterError = { text: string; mine: boolean } | null;

/**
 * `/owner/<id>/mode` (WP-81, SCR-055, BR-APP-086, BR-APP-087, DEV-055, DEV-062): «Как с вами связываться?» — «Через
 * HOMI» (`request`, «Советуем», the default of a new listing) or «Показывать номер» (`phone`), changed at once with
 * `setContactMode` and restored on an error; «Так увидят люди»; and the footer: an error note, «Мои объявления» when the
 * error offers it, «Опубликовать» for a draft or «Готово» for any other listing, as WP-39's save button. A publish is
 * one at a time and flushes first; a draft is published and the done step opens through `closeThen` (its «На
 * проверке» form when the checks held it); any other listing only saves and shows the done step's edit form.
 */
export function ModeStep() {
  const t = useTranslations();
  const owner = useOwnerForm();
  const { ownerListingsLimit } = useReference();
  const setMode = useAction(setContactMode);
  const publish = useAction(publishOwnerListing);
  const { phase, setPhase, confirm } = useSavePhase();
  const [mode, setLocalMode] = useState<ContactMode | null>(null);
  const [error, setError] = useState<FooterError>(null);
  const [busy, setBusy] = useState(false);
  if (owner === null) {
    return null;
  }
  const { listing } = owner;
  const id = listing.id;
  const current: ContactMode = mode ?? (listing.contactMode === "phone" ? "phone" : "request");
  const draft = listing.status === "draft";

  const choose = async (next: ContactMode) => {
    if (next === current) {
      return;
    }
    tg.haptic.impact("light");
    const before = current;
    setLocalMode(next);
    setError(null);
    const result = await setMode({ id, mode: next });
    if (result.ok) {
      putOwnerListing(result.data);
      invalidateOwner();
      return;
    }
    tg.haptic.error();
    setLocalMode(before);
    if (result.code === "owner_disabled") {
      showToast({ key: "own.disabled" });
      void closeOwnerForm();
      return;
    }
    setError({ text: result.error === "offline" ? t("own.actionOffline") : t("own.publishFailed"), mine: false });
  };

  const rejectHere = async (reason: string | undefined, left: () => boolean) => {
    const reread = await bffFetch<OwnerListingBody>(`owner/listings/${id}`);
    // The server's rejected copy, else the copy at hand marked rejected with the answer's reason.
    const base = reread.ok ? reread.data : readResource<OwnerListingBody>(ownerListingKey(id));
    if (base !== undefined) {
      putOwnerListing(base.status === "rejected" ? base : { ...base, status: "rejected", reject_reason: reason === "limit" ? "limit" : "denied" });
    }
    if (!left()) {
      nav.replace(routes.ownerPhone(id));
    }
  };

  const finish = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setPhase("busy");
    setError(null);
    const from = currentAddress();
    // Back left the mode step while it saved or published: the answer is kept, nothing is navigated.
    const left = () => currentAddress() !== from;
    const flushed = await owner.flush();
    if (!flushed.ok) {
      setPhase("idle");
      setBusy(false);
      tg.haptic.error();
      // A switched-off cabinet already closes the form (the autosave's own toast and close): no Back of ours.
      if (flushed.error !== "disabled" && !left()) {
        nav.back();
      }
      return;
    }
    if (!draft) {
      // DEV-062, DEC-80: every save is live; no publish call, so a paused listing stays paused.
      tg.haptic.success();
      await confirm();
      recordDone(id, "edit");
      if (!left()) {
        void closeThen(routes.ownerDone(id));
      }
      return;
    }
    const result = await publish({ id });
    if (result.ok) {
      putOwnerListing(result.data);
      invalidateOwner();
      recordDone(id, normalizeOwnerListing(result.data)?.held === true ? "held" : "new");
      if (!left()) {
        void closeThen(routes.ownerDone(id));
      }
      return;
    }
    setPhase("idle");
    setBusy(false);
    tg.haptic.error();
    switch (result.code) {
      case "owner_disabled":
        showToast({ key: "own.disabled" });
        void closeOwnerForm();
        return;
      case "owner_limit":
        setError({ text: t("own.limitText", { max: result.detail?.max ?? ownerListingsLimit }), mine: true });
        return;
      case "owner_listing_locked":
        setError({ text: t("own.notEditable"), mine: true });
        return;
      case "owner_rejected":
        await rejectHere(result.detail?.reason, left);
        return;
      case "owner_phone_required":
        if (!left()) {
          nav.replace(routes.ownerPhone(id));
        }
        return;
    }
    if (result.error === "validation") {
      // Back to the questionnaire with the parts the server named highlighted (or the save-failed text).
      owner.reportInvalid(result.detail?.fields ?? []);
      if (!left()) {
        nav.back();
      }
      return;
    }
    setError({ text: result.error === "offline" || result.error === "timeout" ? t("own.publishOffline") : t("own.publishFailed"), mine: false });
  };

  const option = (value: ContactMode, title: string, text: string, recommended: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={current === value}
      data-mode={value}
      onClick={() => void choose(value)}
      className={cn("w-full rounded-medium border p-3 text-left", current === value ? "border-accent bg-fill" : "border-sep bg-transparent")}
    >
      <span className="flex items-center gap-2 text-[15px] font-semibold">
        {title}
        {recommended ? <span className="rounded-pill bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-text">{t("own.recommended")}</span> : null}
      </span>
      <span className="mt-1 block text-[13px] leading-[1.4] text-hint">{text}</span>
    </button>
  );

  return (
    <StepFrame onClose={() => nav.back()}
      step="mode"
      title={t("own.modeTitle")}
      footer={
        <div className="flex flex-col gap-2">
          {error === null ? null : (
            <p data-footer-note="" role="alert" className="text-center text-[13px] leading-[1.4] text-danger">
              {error.text}
            </p>
          )}
          {error?.mine ? (
            <Button variant="secondary" data-action="mine" onClick={() => void openMyListings()}>
              {t("own.mine")}
            </Button>
          ) : null}
          <Button data-action={draft ? "publish" : "edit-done"} disabled={busy} onClick={() => void finish()} {...saveButtonProps(phase)}>
            <SaveState phase={phase}>{draft ? t("own.publish") : t("own.edit.done")}</SaveState>
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label={t("own.modeTitle")} className="flex flex-col gap-2">
        {option("request", t("own.mode.gate"), t("own.mode.gateText"), true)}
        {option("phone", t("own.mode.open"), t("own.mode.openText"), false)}
      </div>
      <div className="mt-5">
        <ListingPreview listing={listing} />
      </div>
    </StepFrame>
  );
}
