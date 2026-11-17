"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { replaceTop } from "@/lib/navigation/history";
import { useBack } from "@/lib/navigation/useBack";
import { useCloseOnce } from "@/lib/navigation/useCloseOnce";

import { useListingNumber, useListingRecord } from "../useListing";

const PhotoViewer = dynamic(() => import("./PhotoViewer").then((module) => module.PhotoViewer), { ssr: false });

/** `?i=` clamped to the photos there are: a whole number from 0, anything else the first photo. */
function photoIndex(value: string | null, count: number): number {
  const index = value === null || value === "" ? 0 : Number(value);
  if (!Number.isInteger(index) || index < 0) {
    return 0;
  }
  return Math.min(index, Math.max(0, count - 1));
}

/**
 * The listing's photos at `/listing/{number}/photos?i=` (WP-26, SCR-020): the viewer over the listing, loaded with
 * `next/dynamic` on the client only, in both route trees. It reads the listing's resource without reading itself:
 * the full set once the answer is there, the card's preview photos while it is pending (G-10), none before either —
 * the dialog still opens, empty. Paging replaces `i` in the current address, locale included, with no new history
 * entry (`history.replaceState` and the app's stack); ×, Escape, the swipe down and Telegram's Back close it through
 * `back()`, the first three once per address (`useCloseOnce`). The hero does not follow the photo the viewer closed
 * on (legacy).
 */
export function PhotoViewerRoute() {
  const number = useListingNumber();
  const { details, preview } = useListingRecord(number);
  const searchParams = useSearchParams();
  const { back } = useBack();
  const close = useCloseOnce(back);

  if (number === null) {
    return null;
  }
  const photos = details?.photos.items ?? preview?.photos.preview ?? [];

  const page = (index: number) => {
    // From the document, not `routes.listingPhotos`: that is spelled without the locale segment.
    const url = new URL(window.location.href);
    url.searchParams.set("i", String(index));
    const href = url.pathname + url.search;
    window.history.replaceState(null, "", href);
    replaceTop(href);
  };

  return <PhotoViewer photos={photos} index={photoIndex(searchParams?.get("i") ?? null, photos.length)} onIndexChange={page} onClose={close} />;
}
