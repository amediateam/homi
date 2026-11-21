import type { ReactNode } from "react";

import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { serverApi } from "@/lib/api/server";
import { isOwnerId } from "@/lib/navigation/routes";
import { getSessionToken } from "@/lib/session/server";

import { OwnerFormLayer } from "./OwnerFormLayer";
import type { OwnerListingBody } from "./store";

/**
 * The owner listing read on the server with the session cookie (WP-81, `25` §3.4), or `undefined`: without the
 * cookie (header mode, the first request of a launch), for an id that is not a ULID, and on any failure the layer
 * reads it through `/bff` and shows its own states. Nothing here is cached.
 */
async function readOwnerListing(id: string): Promise<OwnerListingBody | undefined> {
  if (!isOwnerId(id) || (await getSessionToken()) === null) {
    return undefined;
  }
  const result = await (await serverApi()).ownerListing(id);
  return result.ok ? result.data : undefined;
}

/** The `[id]` layout of both trees: the layer with the server's read. */
export async function OwnerFormServer({
  params,
  presentation,
  children,
}: {
  params: Promise<{ id: string }>;
  presentation: RoutePresentation;
  children: ReactNode;
}) {
  const initial = await readOwnerListing((await params).id);
  return (
    <OwnerFormLayer params={params} presentation={presentation} {...(initial === undefined ? {} : { initial })}>
      {children}
    </OwnerFormLayer>
  );
}
