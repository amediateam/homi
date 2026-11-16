"use client";

import { cn, ImageOff } from "@homi/ui";
import { useCallback, useState, useSyncExternalStore } from "react";

import { markFirstContent } from "@/lib/analytics/firstContent";
import { useGraphicsMode } from "@/lib/graphics";

import { photoSources, smallPhotosOnly, thumbUrl } from "./images";

/**
 * A listing photo (BR-APP-059, `03` SCR-007). Plain `<img>` elements, not `next/image`: the addresses are signed by
 * the API and must reach the browser unchanged (`25` §4.5). No referrer leaves with them, and no retry follows a
 * failed load: the placeholder stays.
 */

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };

/** Chromium reports a change of Save-Data or of the connection type on `navigator.connection`. */
function subscribeConnection(listener: () => void): () => void {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  connection?.addEventListener?.("change", listener);
  return () => connection?.removeEventListener?.("change", listener);
}

/**
 * The network rule at render time: Save-Data, 3g or slower, or lite graphics. On the server and in the hydration
 * render it is `serverHint` (what the request told the server, else `false`), so the server's sources and the first
 * client render agree; the client's own answer follows right after. When the two differ, a server-rendered photo
 * may start loading from the server's sources first (BR-APP-059, the limit named in WP-24).
 */
function useSmallPhotosOnly(serverHint = false): boolean {
  const { lite } = useGraphicsMode();
  const network = useSyncExternalStore(subscribeConnection, () => smallPhotosOnly(), () => serverHint);
  return lite || network;
}

export interface PhotoProps {
  /** The address as the API sent it; `null` shows the placeholder. */
  src: string | null;
  /** `sizes` of the photo's box (`PHOTO_SIZES`, `COMPACT_PHOTO_SIZES`); without it the address is used alone. */
  sizes?: string;
  /**
   * Load at once with high priority and without the fade: the first photo of the first two cards (SCR-007). A
   * server-rendered first photo is then visible before hydration. Otherwise lazy and faded in.
   */
  eager?: boolean;
  /** `contain` inside the frame of a video listing; `cover` otherwise. */
  fit?: "cover" | "contain";
  /**
   * The network rule as the server saw it (the `Save-Data` header, the Telegram-Android class of the User-Agent):
   * used by the server render and the hydration render only. Without it both offer the full `srcset`.
   */
  serverSmallOnly?: boolean;
}

/**
 * The «no photo» box: no photos, or the photo failed to load. Positioned, so in a video slide it paints over the
 * blurred copy (legacy `.slide.vframe .photo`).
 */
export function PhotoPlaceholder() {
  return (
    <div data-photo="placeholder" className="relative grid size-full place-items-center bg-fill text-hint">
      <ImageOff size={28} strokeWidth={1.5} aria-hidden />
    </div>
  );
}

/**
 * One photo: `srcset` and `sizes` from `photoSources`; a lazy photo fades in once loaded. The first photo that loads
 * marks the first content (`markFirstContent`). A server-rendered photo can finish before hydration attaches `onLoad`
 * and `onError`, so the element is read once when it mounts.
 */
export function Photo({ src, sizes, eager = false, fit = "cover", serverSmallOnly }: PhotoProps) {
  const smallOnly = useSmallPhotosOnly(serverSmallOnly);
  const [loaded, setLoaded] = useState(eager);
  const [failed, setFailed] = useState(false);
  const shown = useCallback(() => {
    setLoaded(true);
    markFirstContent();
  }, []);
  const settled = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete) {
        if (img.naturalWidth > 0) {
          shown();
        } else {
          setFailed(true);
        }
      }
    },
    [shown],
  );

  if (!src || failed) {
    return <PhotoPlaceholder />;
  }
  const sources = photoSources(src, sizes, smallOnly);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed addresses must reach the browser unchanged.
    <img
      ref={settled}
      src={sources.src}
      srcSet={sources.srcSet}
      sizes={sources.sizes}
      alt=""
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onLoad={shown}
      onError={() => setFailed(true)}
      className={cn(
        "relative block size-full opacity-0 transition-opacity duration-(--dur-fast)",
        fit === "contain" ? "object-contain" : "object-cover",
        loaded && "opacity-100",
      )}
    />
  );
}

/**
 * The blurred copy behind a photo of a video listing (legacy `vbg`): the small variant, decorative. Lite graphics hide
 * it; there the photo itself is the small variant, so the copy costs no second download.
 */
export function PhotoBackdrop({ src, eager = false }: { src: string; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed addresses must reach the browser unchanged.
    <img
      src={thumbUrl(src)}
      alt=""
      aria-hidden
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      className="absolute -inset-[24px] size-[calc(100%+48px)] max-w-none scale-[1.05] object-cover blur-[22px] brightness-75 [html.lite_&]:hidden"
    />
  );
}
