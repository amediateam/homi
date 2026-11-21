"use client";

import { labelFor } from "@homi/i18n";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { answerRequest, type OwnerRequestAction } from "@/lib/actions/owner";
import { useAction } from "@/lib/actions/useAction";
import { reportError } from "@/lib/errors/report";
import { showToast } from "@/lib/ui/toast";
import { tg } from "@/lib/telegram";

import { invalidateOwner } from "../store";
import { normalizeRequest, type OwnerRequestView } from "./useOwnerRequests";

/** The reason chosen for a request in this launch (SCR-058): it hides the reason buttons; `undo` or `decline` clears it. */
export type ChosenReason = "found" | "agent";

const chosen = new Map<string, ChosenReason>();
const listeners = new Set<() => void>();
let version = 0;

function announce(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The reason chosen for `id` in this launch, if any (re-renders on every change). */
export function useChosenReason(id: string): ChosenReason | null {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return chosen.get(id) ?? null;
}

/** Tests only. */
export function resetChosenReasons(): void {
  chosen.clear();
  announce();
}

/**
 * One answer at a time to a request of «Отклики» (WP-82, SCR-058, BR-APP-090): no confirmation; the medium haptic for
 * «Дать номер», the light one for the rest, then the success or error haptic. The answer replaces the card
 * (`onAnswered`, the old name kept when it has none); a chosen reason is remembered for this launch, `undo` and
 * `decline` forget it. The toast is the table `ownerAnswer`, or «Отметку сняли» for `undo` on a given request.
 * `409 request_answer_closed` reads the list again (`onClosed`), and for `undo` says «Отменить уже нельзя…». Then
 * `invalidateOwner()`. A failure reaches the error facade with its code only — never the seeker's name or message
 * (`16` SEC-REQ-036).
 */
export function useAnswer(options: { onAnswered: (request: OwnerRequestView) => void; onClosed: () => void }) {
  const answer = useAction(answerRequest);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const { onAnswered, onClosed } = options;

  const run = useCallback(
    async (request: OwnerRequestView, action: OwnerRequestAction) => {
      if (running.current) {
        return;
      }
      running.current = true;
      setBusy(request.id);
      tg.haptic.impact(action === "give" ? "medium" : "light");
      try {
        const result = await answer({ id: request.id, action });
        if (!result.ok) {
          tg.haptic.error();
          if (result.code === "request_answer_closed") {
            onClosed();
            invalidateOwner();
            showToast({ key: action === "undo" ? "own.undoLate" : "common.saveFailed" });
            return;
          }
          reportError(new Error(`owner request answer failed: ${result.code ?? result.error}`), { kind: "error", source: "owner-answer" });
          showToast({ key: result.error === "offline" || result.error === "timeout" ? "own.actionOffline" : "common.saveFailed" });
          return;
        }
        tg.haptic.success();
        if (action === "reason_found" || action === "reason_agent") {
          chosen.set(request.id, action === "reason_found" ? "found" : "agent");
        } else if (action === "undo" || action === "decline") {
          chosen.delete(request.id);
        }
        announce();
        const next = normalizeRequest(result.data);
        if (next !== null) {
          onAnswered(next);
        }
        showToast({ key: action === "undo" && request.status === "given" ? "own.unmarked" : labelFor("ownerAnswer", action) });
        invalidateOwner();
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [answer, onAnswered, onClosed],
  );

  return { busy, run };
}
