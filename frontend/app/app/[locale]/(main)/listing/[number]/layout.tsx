import type { ReactNode } from "react";
import { Suspense } from "react";

import { ListingLayer } from "@/features/listing/ListingLayer";
import { ListingServer } from "@/features/listing/ListingServer";

/** Listing (SCR-018, SCR-019), kept mounted under photos, location, market and actions. Direct load, shown as the standalone layer. */
export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ number: string }> }) {
  return (
    <Suspense fallback={null}>
      <ListingLayer params={params} presentation="standalone" screen={<ListingServer params={params} />}>
        {children}
      </ListingLayer>
    </Suspense>
  );
}
