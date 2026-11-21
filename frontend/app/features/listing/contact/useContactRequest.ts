"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import { sendContactRequest } from "@/lib/actions/listing";
import { useAction } from "@/lib/actions/useAction";
import { reportError } from "@/lib/errors/report";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";
import { withChatAccess } from "@/lib/telegram/chatAccess";

import type { ListingDetails } from "../listingData";
import { requestBody, type RequestDraft } from "./requestForm";
import { requestOutcome, type RequestOutcome } from "./requestErrors";
import { closeRequestsHere, patchRequestStatus, rereadListing } from "./requestState";

/**
 * One send of the request sheet at a time (WP-83, SCR-061, TMA-033): ignored without a «who» or while a send runs; a
 * medium haptic; the body with the current launch's `initData` (DEC-76, never kept); through `withChatAccess` (one
 * retry after the write access is granted, the bot offered with «Перезапустить» when Telegram cannot ask). Success:
 * the success haptic, the answered status written into the card at once, the card read again in the background, and
 * `onDone` closes the sheet. Failure: the error haptic and the outcome of `requestOutcome` — its line, a re-read, a
 * close, the closed bar for this number. A failure reaches the error facade by its code only.
 */
export function useContactRequest(details: ListingDetails, onDone: () => void) {
  const t = useTranslations();
  const send = useAction(sendContactRequest);
  const { requestLimits } = useReference();
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<RequestOutcome["line"]>(null);
  const running = useRef(false);
  const number = details.number;

  const submit = useCallback(
    async (draft: RequestDraft) => {
      const body = requestBody(draft);
      if (body === null || running.current) {
        return;
      }
      running.current = true;
      setSending(true);
      setLine(null);
      tg.haptic.impact("medium");
      try {
        const result = await withChatAccess(() => send({ number, ...body, init_data: tg.initData() }), { restartText: t("contact.err.noChatRestart") });
        if (result.ok) {
          tg.haptic.success();
          patchRequestStatus(number, result.data.status);
          rereadListing(number);
          onDone();
          return;
        }
        tg.haptic.error();
        const outcome = requestOutcome(result, requestLimits);
        if (outcome.closeHere) {
          closeRequestsHere(number);
        }
        if (outcome.reread) {
          rereadListing(number);
        }
        if (outcome.close) {
          onDone();
          return;
        }
        if (result.code === undefined || outcome.line?.key === "common.saveFailed") {
          reportError(new Error(`contact request failed: ${result.code ?? result.error}`), { kind: "error", source: "contact-request" });
        }
        setLine(outcome.line);
      } finally {
        running.current = false;
        setSending(false);
      }
    },
    [number, onDone, requestLimits, send, t],
  );

  return { submit, sending, line };
}
