import { cn, Skeleton } from "@homi/ui";

/** The placeholder blocks (WP-26, SCR-019, legacy sizes); hidden from assistive technology. */

/** No preview and no answer yet: the hero and three bars. */
export function ListingSkeleton() {
  return (
    <div data-listing-skeleton="" aria-hidden>
      <Skeleton className="mx-auto aspect-[4/3] w-full max-w-[608px] rounded-none" />
      <div className="mx-auto flex max-w-[608px] flex-col gap-[12px] px-[16px] pt-[16px]">
        <Skeleton className="h-[22px] w-[70%]" />
        <Skeleton className="h-[22px] w-[50%]" />
        <Skeleton className="h-[64px] w-full" />
      </div>
    </div>
  );
}

const LINE_WIDTHS = ["w-[40%]", "w-full", "w-[85%]", "w-[60%]"] as const;

/** A section whose data is pending: a heading bar and `lines − 1` text lines. */
export function SectionSkeleton({ lines }: { lines: 3 | 4 }) {
  return (
    <div data-section-skeleton={lines} aria-hidden className="flex flex-col gap-[10px] py-[16px]">
      {LINE_WIDTHS.slice(0, lines).map((width, index) => (
        <Skeleton key={width} className={cn(index === 0 ? "h-[20px]" : "h-[14px]", width)} />
      ))}
    </div>
  );
}
