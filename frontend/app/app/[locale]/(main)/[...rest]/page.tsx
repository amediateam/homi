import { notFound } from "next/navigation";
import { Suspense } from "react";

async function Unknown({ params }: { params: Promise<{ rest: string[] }> }): Promise<never> {
  await params;
  notFound();
}

/**
 * Any address under a locale that no route matches renders `[locale]/not-found.tsx` (WP-20). Documents render at
 * request time (ADR-0020), so the answer is `200` with `noindex`, not `404` (AM-57). `notFound()` runs under
 * `<Suspense>`, as for an invalid parameter: thrown outside one it makes Next.js send its `__next_error__` shell,
 * which the client renders without the root layout's head scripts — no boot script, so inside Telegram no SDK tag, the
 * session goes `outside` and the gates replace the not-found screen with `/outside`.
 */
export default function UnknownAddress({ params }: PageProps<"/[locale]/[...rest]">) {
  return (
    <Suspense fallback={null}>
      <Unknown params={params} />
    </Suspense>
  );
}
