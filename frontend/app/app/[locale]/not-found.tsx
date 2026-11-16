import { buttonVariants, cn, EmptyState } from "@homi/ui";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { routes } from "@/lib/navigation/routes";

/**
 * The not-found screen (WP-23, D-E-3): an address under a locale that no route matches (`(main)/[...rest]`) and every
 * `notFound()` of a page, in place of everything below the root layout. Documents render at request time, so it
 * answers `200` with the `noindex` Next.js adds (AM-57); an address whose first segment is not a locale is redirected
 * by `proxy.ts` before it gets here. «К поиску» replaces the address with the feed, so Back does not come back here;
 * it is the counted `Link` with the button's look (`buttonVariants`, not `Button asChild`: Radix Slot is no Client
 * Component and calls a hook, and this is a Server Component). The magnifier is the brand's neutral "nothing here"
 * placeholder.
 */
export default function NotFound() {
  const t = useTranslations();

  return (
    <main data-route="not-found" className="mx-auto w-full max-w-(--feed-max) pt-(--top-inset) pb-(--bottom-inset)">
      <EmptyState
        tall
        titleAs="h1"
        image={brand.assets.emptyMagnifier}
        title={t("error.notFound")}
        action={
          <Link
            href={routes.feed()}
            replace
            className={cn(buttonVariants({ variant: "secondary" }), "px-4 text-[15px]")}
          >
            {t("error.toSearch")}
          </Link>
        }
      />
    </main>
  );
}
