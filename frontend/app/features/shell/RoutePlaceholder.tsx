import { Button, cn } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/navigation/routes";

/** The layer an address renders into: a sheet or overlay slot when intercepted, the page itself otherwise. */
export type RouteLayer = "sheet" | "overlay";

/**
 * The frame of a sheet placeholder that no `RouteSheet` draws yet (sort, city, quick filters, radar sheets). The
 * overlay has none: `RouteOverlay` draws the listing layer in both of its presentations.
 */
const SHEET_FRAME =
  "fixed inset-x-0 bottom-0 z-(--z-backdrop) max-h-[85%] overflow-y-auto rounded-t-large bg-sheet pb-(--bottom-inset) shadow-(--shadow-float)";

/** Where a placeholder links to, so that soft navigation and Back can be followed before the real screens exist. */
const LINKS: Record<string, string[]> = {
  feed: [routes.filters(), routes.quickFilter("rooms"), routes.sort(), routes.city(), routes.listing(42), routes.map()],
  map: [routes.filters({ from: "map" }), routes.feed()],
  radars: [routes.radarNew()],
  settings: [routes.settingsPage("theme")],
};

/**
 * What every address shows until its package replaces the import (WP-20): the route name, the locale, a translated
 * string and one `Button`. `children` is the nested layer of a layout (listing, radar, settings), so the nesting is
 * visible; `layer` marks the intercepted copy in a slot (`data-layer`, which the end-to-end specs select). A sheet
 * placeholder draws its own frame unless `framed`: then a `RouteSheet` around it draws the sheet (WP-23). `className`
 * goes last. The links (WP-21) go through the counted `Link`. Works in Server and Client Components.
 */
export function RoutePlaceholder({
  name,
  layer,
  framed = false,
  links = LINKS[name] ?? [],
  className,
  children,
}: {
  name: string;
  layer?: RouteLayer;
  framed?: boolean;
  links?: string[];
  className?: string;
  children?: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <section
      data-route={name}
      data-layer={layer}
      className={cn(
        "mx-auto flex w-full max-w-(--feed-max) flex-col gap-3 px-(--gutter) py-4",
        layer === "sheet" && !framed && SHEET_FRAME,
        className,
      )}
    >
      <h1 className="text-[20px] font-bold">{name}</h1>
      <p className="text-hint">
        {locale} · {t("demo.hint")}
      </p>
      <div className="glass rounded-large p-3" data-glass-sample="">
        <Button variant="primary">{t("common.close")}</Button>
      </div>
      {links.length > 0 ? (
        <nav className="flex flex-wrap gap-2 text-[13px]">
          {links.map((href) => (
            <Link key={href} href={href} data-link={href} className="rounded-pill bg-fill px-3 py-1">
              {href}
            </Link>
          ))}
        </nav>
      ) : null}
      {children}
    </section>
  );
}
