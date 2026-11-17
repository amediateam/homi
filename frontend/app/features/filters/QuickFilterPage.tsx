import { notFound } from "next/navigation";

import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { isQuickFilterKind } from "@/lib/navigation/routes";

import { QuickFilterSheetRoute } from "./QuickFilterSheetRoute";

/**
 * The `/filters/[kind]` page in both presentations (SCR-015, WP-25), a Server Component. With `cacheComponents` the
 * parameter is runtime data, so the route file passes the `params` promise here inside `<Suspense>` (the WP-20
 * pattern); a kind other than `rooms`, `price` or `owner` calls `notFound()`, which renders the not-found screen in
 * the slot and on the direct load.
 */
export async function QuickFilterPage({
  params,
  presentation,
}: {
  params: Promise<{ kind: string }>;
  presentation: RoutePresentation;
}) {
  const { kind } = await params;
  if (!isQuickFilterKind(kind)) {
    notFound();
  }
  return <QuickFilterSheetRoute kind={kind} presentation={presentation} />;
}
