import { cn } from "@homi/ui";
import type { ReactNode } from "react";

/**
 * The frame of one section of the filters sheet (WP-25): a heading with an optional muted hint and pill, then the
 * controls. `name` marks the section for tests and the order check (`data-section`); `focus` marks the section a
 * launch scrolls to (`data-focus`, the pets entry). The section is a labelled group, so its controls are found by
 * role inside it.
 */
export function Section({
  name,
  title,
  hint,
  pill,
  focus,
  className,
  children,
}: {
  name: string;
  title: ReactNode;
  hint?: ReactNode;
  pill?: ReactNode;
  focus?: string;
  className?: string;
  children?: ReactNode;
}) {
  const id = `filters-section-${name}`;
  return (
    <section
      data-section={name}
      data-focus={focus}
      role="group"
      aria-labelledby={id}
      className={cn("flex flex-col gap-2.5 px-(--gutter) py-3", className)}
    >
      <h2 id={id} className="flex flex-wrap items-center gap-x-1.5 text-[15px] font-semibold text-text">
        <span>{title}</span>
        {hint ? <span className="font-normal text-hint">{hint}</span> : null}
        {pill}
      </h2>
      {children}
    </section>
  );
}

/** A wrapping row of `FilterChip`s. */
export function ChipRow({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

/** A muted line under the controls of a section. */
export function SectionHint({ children }: { children?: ReactNode }) {
  return <p className="text-[13px] leading-snug text-hint">{children}</p>;
}
