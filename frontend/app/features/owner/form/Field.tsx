"use client";

import { cn } from "@homi/ui";
import type { ReactNode } from "react";

/**
 * One field of the questionnaire: its label, its controls and its hint, marked by its `data-focus` token (the
 * highlight of `?focus=` and of «Дальше»'s missing parts) and `data-invalid` while the server or the gate refused it.
 */
export function Field({
  label,
  focus,
  invalid = false,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  focus: string;
  invalid?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-focus={focus}
      data-invalid={invalid ? "" : undefined}
      className={cn(
        "rounded-medium p-[2px] transition-[box-shadow] duration-300 data-highlight:ring-2 data-highlight:ring-accent data-invalid:ring-2 data-invalid:ring-danger",
        className,
      )}
    >
      {label === undefined ? null : <h2 className="mb-2 text-[15px] font-semibold text-text">{label}</h2>}
      {children}
      {hint === undefined ? null : <p className="mt-1.5 text-[13px] leading-[1.4] text-hint">{hint}</p>}
    </section>
  );
}

/** A row of chips that wraps. */
export function Chips({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
