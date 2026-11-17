import { Skeleton } from "@homi/ui";

/** Widths of the three text bars (legacy `ListingCardSkeleton`). */
const BARS = ["w-[62%]", "w-[80%]", "w-[35%]"];

/** The column of a listing list (legacy `.feed`): `ListingFeed` and the skeleton of the page's `<Suspense>`. */
export const FEED_FRAME = "flex flex-col gap-[28px] px-(--gutter) pt-[6px]";

/**
 * The placeholder of a listing card while a list loads its first page (SCR-008): the photo box and three text bars
 * with the shimmer of `Skeleton`, which `motion.css` of `@homi/ui` stops under reduced motion. No hooks and no
 * client code, so a `<Suspense>` fallback renders it on the server.
 */
export function ListingCardSkeleton() {
  return (
    <div data-card-skeleton="" aria-hidden>
      <Skeleton className="aspect-[4/3] rounded-photo" />
      <div className="flex flex-col gap-[2px] pt-[12px]">
        {BARS.map((width) => (
          <Skeleton key={width} className={`mt-[8px] h-[14px] rounded-[7px] ${width}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * The fallback of the feed page's `<Suspense>` (SCR-008): three card skeletons in the list's own column, so the
 * cards or `ListingFeed`'s own skeletons take their place without a jump.
 */
export function FeedSkeleton() {
  return (
    <div data-feed-skeleton="" className={FEED_FRAME}>
      <ListingCardSkeleton />
      <ListingCardSkeleton />
      <ListingCardSkeleton />
    </div>
  );
}
