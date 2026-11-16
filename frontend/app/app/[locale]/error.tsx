"use client";

import { CrashScreen } from "@/features/gates/CrashScreen";

/**
 * The error boundary below the root layout (WP-23, SCR-045): a render error of any page, layout or slot under
 * `[locale]/layout.tsx` — the shell included — leaves the crash screen in their place. The boundary sits inside that
 * layout, so the catalogue and the providers are there; a failure of the layout itself reaches `app/global-error.tsx`.
 * Next.js 16.4 also passes `retry` and `reset`; neither is used, «Обновить» reloads the document (`CrashScreen`).
 */
export default function RouteError({ error }: { error: unknown }) {
  return (
    <main data-route="error" className="mx-auto w-full max-w-(--feed-max) pt-(--top-inset) pb-(--bottom-inset)">
      <CrashScreen error={error} />
    </main>
  );
}
