"use client";

import { cn, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";

import type { NudgeKind } from "./store";

/**
 * The legacy `.nudge` card (`nudges.css`), shared by the follow nudge and the return banner: fixed 12 px from the
 * column's edges — not the 16 px gutter — and above the tab bar and the floating toggle at the toast's height, on the
 * nudge level of the ladder (35: above the tab bar 30 and the mini title 31, below sub-pages 40 and the listing 45).
 * A solid sheet surface in every mode, 18 px corners, legacy's own shadow, `rise-in`. A status card (`role=status`)
 * that is not itself a live region (`aria-live="off"`): it is inserted already filled, which screen readers do not
 * reliably announce, so `NudgeHost` announces its title through a live line that is always in the document, and
 * the card is not read a second time. No Back handler and no tap outside: only its own buttons end it.
 */
export function NudgeFrame({ kind, children }: { kind: NudgeKind; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+78px)] z-(--z-nudge) mx-auto max-w-(--feed-max) px-[12px]">
      <div
        role="status"
        aria-live="off"
        data-nudge={kind}
        className="pointer-events-auto flex animate-rise-in items-center gap-[10px] rounded-[18px] bg-sheet py-[12px] pr-[8px] pl-[14px] text-text shadow-[0_12px_32px_#00000047,0_0_0_0.5px_var(--sep)]"
      >
        {children}
      </div>
    </div>
  );
}

/** «Включить» / «Настроить» of a nudge (`.nudge-go`): 36 px, accent, 14 px bold; the medium impact is the caller's. */
export function NudgeGo({ className, ...props }: Omit<ComponentProps<"button">, "type">) {
  return (
    <button
      type="button"
      data-action="enable"
      className={cn("h-[36px] shrink-0 rounded-[18px] bg-accent px-[14px] text-[14px] font-bold text-accent-text", className)}
      {...props}
    />
  );
}

/** × of a nudge (`.nudge-x`): 30 × 30, the hint colour, named `common.close`. */
export function NudgeClose({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      data-action="close"
      aria-label={t("common.close")}
      onClick={onClose}
      className="grid size-[30px] shrink-0 place-items-center text-hint"
    >
      <X size={16} aria-hidden />
    </button>
  );
}
