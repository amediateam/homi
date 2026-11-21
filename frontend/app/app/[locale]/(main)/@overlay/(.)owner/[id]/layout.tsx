import type { ReactNode } from "react";
import { Suspense } from "react";

import { OwnerFormServer } from "@/features/owner/OwnerFormServer";

/** The owner form (SCR-050 … SCR-056): the questionnaire, kept mounted under its steps. Intercepted into the overlay slot. */
export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <OwnerFormServer params={params} presentation="layer">
        {children}
      </OwnerFormServer>
    </Suspense>
  );
}
