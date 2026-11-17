import { notFound } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import { isListingNumber } from "@/lib/navigation/routes";
import { getSessionToken } from "@/lib/session/server";

import { type ListingInitial, toRecord } from "./listingData";
import { ListingScreen } from "./ListingScreen";

/**
 * The server part of the listing (WP-26), inside the layer's `<Suspense>`: with the session cookie it reads
 * `GET /listings/{number}` and hands the answer to the screen; without one (header mode, the first request of a
 * launch) and after an `unauthorized` it hands `null`, and the browser reads once the session is ready (WP-21). Any
 * other failure is passed on, not thrown: the screen shows its state. An address without a valid number is not
 * found. Nothing here is cached. The screen is keyed by the number, so nothing of another listing survives in it.
 */
export async function ListingServer({ params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  if (!isListingNumber(raw)) {
    notFound();
  }
  const number = Number(raw);
  let initial: ListingInitial | null = null;
  if ((await getSessionToken()) !== null) {
    const result = toRecord(await (await serverApi()).listing(number));
    initial = !result.ok && result.error === "unauthorized" ? null : result;
  }
  return <ListingScreen key={number} number={number} initial={initial} />;
}
