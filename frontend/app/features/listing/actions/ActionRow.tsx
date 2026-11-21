"use client";

import { ChevronRight, cn, type LucideIcon } from "@homi/ui";

export interface ActionRowProps {
  /** `data-action-row`: what the end-to-end specs select (`hide`, `block`, `report`, `support`, a reason, a detail code). */
  action: string;
  icon?: LucideIcon;
  title: string;
  hint?: string;
  /** The › of a row that opens the next step. */
  arrow?: boolean;
  /** While a request runs every row ignores taps (and looks it). */
  disabled?: boolean;
  /** `ph-mask ph-no-capture` on the hint: it holds a phone number (the block hint, DEC-52); neither replay nor autocapture takes it. */
  maskHint?: boolean;
  onSelect: () => void;
}

const ROW =
  "flex w-full items-center gap-3 border-b-[0.5px] border-sep py-[13px] text-left outline-none select-none last:border-b-0 focus-visible:bg-fill active:opacity-70 disabled:opacity-50";

/** A row of the actions sheet (SCR-023): an optional icon, the title, the hint under it and an optional ›. */
export function ActionRow({ action, icon: Icon, title, hint, arrow = false, disabled = false, maskHint = false, onSelect }: ActionRowProps) {
  return (
    <button type="button" data-action-row={action} disabled={disabled} onClick={onSelect} className={ROW}>
      {Icon ? (
        <span aria-hidden className="grid size-9 flex-none place-items-center rounded-pill bg-fill text-text">
          <Icon size={20} strokeWidth={2} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[17px] font-semibold tracking-[-0.01em] text-text">{title}</span>
        {hint ? <span className={cn("text-[14px] leading-snug text-hint", maskHint && "ph-mask ph-no-capture")}>{hint}</span> : null}
      </span>
      {arrow ? <ChevronRight size={20} strokeWidth={2} aria-hidden className="flex-none text-hint" /> : null}
    </button>
  );
}
