import type { ReactNode } from "react";
import { Suspense } from "react";

import { OwnerListingsRoute } from "@/features/owner/lists/OwnerListingsRoute";

/**
 * «Мои объявления» (SCR-057, WP-82): the list is the layout of `/settings/owner`, so it stays mounted — with its tab and
 * scroll — under «Отклики» (`[id]/requests`), as the settings screen stays under it. The child page is `children`.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <OwnerListingsRoute />
      </Suspense>
      {children}
    </>
  );
}
