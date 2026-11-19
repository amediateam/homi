"use client";

import { Button, Trash } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { clearHistory } from "@/lib/actions/history";
import { useAction } from "@/lib/actions/useAction";
import type { DevFlags } from "@/lib/flags";
import { confirmText } from "@/lib/ui/confirm";
import { failed, saved } from "@/lib/ui/feedback";

export interface ClearHistoryButtonProps {
  /** The history was cleared on the server: the screen shows its empty state. */
  onCleared: () => void;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

/**
 * The tool row of history (SCR-025; legacy `.feed-tools` of `ListingFeed`): right-aligned above the first card — the
 * list renders it only while a card is visible — with the text button «Очистить» and the trash icon. A tap asks
 * «Очистить историю просмотров?» (`confirmText`, TMA-026); Cancel sends nothing. OK disables the button and sends
 * `DELETE /history` (`clearHistory`, BR-APP-067): success plays the success haptic (TMA-025) and hands over to
 * `onCleared`, with no undo; failure plays the error haptic, with `dev016ErrorToastOnFailure` also the toast «Не
 * получилось сохранить» (`failed`, LB-APP-027), and the button is enabled again. Taps while the question or the
 * request runs are ignored (legacy had no guard). The button is disabled with `aria-disabled`, not `disabled`, so a
 * keyboard focus on it stays there while the request runs and after a failure (WCAG 2.4.3).
 */
export function ClearHistoryButton({ onCleared, flags }: ClearHistoryButtonProps) {
  const t = useTranslations();
  const clear = useAction(clearHistory);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const press = async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    try {
      if (!(await confirmText(t("feed.clearConfirm")))) {
        return;
      }
      setPending(true);
      const result = await clear(undefined);
      if (result.ok) {
        saved();
        onCleared();
      } else {
        failed({ flags });
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <div data-tools="history" className="flex items-center justify-end px-[2px]">
      <Button
        variant="text"
        data-clear-history=""
        aria-disabled={pending || undefined}
        className="gap-[5px] text-[15px] font-semibold text-text active:scale-100 active:opacity-70 aria-disabled:opacity-40"
        onClick={() => void press()}
      >
        <Trash size={15} aria-hidden />
        {t("feed.clear")}
      </Button>
    </div>
  );
}
