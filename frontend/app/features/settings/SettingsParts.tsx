import { ChevronRight, cn } from "@homi/ui";
import type { ReactNode } from "react";

/**
 * A group of the settings screen (legacy `SettingsGroup`, `settings.css` `.set-group`): a 13 px title, the rows on a
 * card of the fill colour with 16 px corners, and an optional footer line.
 */
export function SettingsGroup({ id, title, footer, children }: { id: string; title: string; footer?: string; children: ReactNode }) {
  return (
    <section data-settings-group={id} aria-label={title}>
      <h3 className="mx-[4px] mb-[8px] text-[13px] font-semibold text-hint">{title}</h3>
      <div className="overflow-hidden rounded-[16px] bg-fill">{children}</div>
      {footer ? <p className="mx-[4px] mt-[8px] text-[13px] leading-[1.4] text-hint">{footer}</p> : null}
    </section>
  );
}

/** The separator between two rows, 56 px from the left as legacy's `.set-row + .set-row:before`. */
const ROW_SEPARATOR =
  "not-first:before:pointer-events-none not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-[56px] not-first:before:border-t-[0.5px] not-first:before:border-sep";

/** The 30 px square under a row's icon (legacy `.set-icon`). */
export function SettingsIcon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid size-[30px] flex-none place-items-center rounded-[9px] bg-bg text-text">
      {children}
    </span>
  );
}

/**
 * A row that opens a page or acts (legacy `SettingsRow`): the icon, the name, the current value right-aligned and
 * truncated, and a chevron. `count` above 0 shows a red counter instead of the value, `value` then being its name.
 */
export function SettingsRow({
  id,
  icon,
  label,
  value,
  onClick,
  className,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-settings-row={id}
      onClick={onClick}
      className={cn(
        "relative flex min-h-[52px] w-full items-center gap-[12px] px-[14px] text-left outline-none select-none focus-visible:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] active:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]",
        ROW_SEPARATOR,
        className,
      )}
    >
      <SettingsIcon>{icon}</SettingsIcon>
      <span className="min-w-0 flex-1 text-[16px] text-text">{label}</span>
      {value !== "" ? (
        <span data-settings-value="" className="max-w-[45%] truncate text-[15px] text-hint">
          {value}
        </span>
      ) : null}
      <ChevronRight aria-hidden size={18} className="-mr-[4px] flex-none text-hint" />
    </button>
  );
}

/** A row of text that does nothing (legacy `.set-row.static`): the about text. */
export function SettingsText({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("relative flex w-full items-start gap-[12px] px-[14px] py-[12px]", ROW_SEPARATOR)}>
      <SettingsIcon>{icon}</SettingsIcon>
      <p className="min-w-0 flex-1 text-[14px] leading-[1.4] text-hint">{children}</p>
    </div>
  );
}
