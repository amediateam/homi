import type { ReactNode } from "react";

/** One entry of the gallery: a titled section with a stable `data-testid` (`gallery-<id>`) for the specs. */
export function Entry({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={`gallery-${id}`} aria-labelledby={`gallery-${id}-title`} className="flex flex-col gap-3">
      <h2 id={`gallery-${id}-title`} className="text-[17px] font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}
