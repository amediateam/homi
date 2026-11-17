import { isLiteGraphics } from "@/lib/graphics";

/**
 * Photo addresses of a listing (BR-APP-059). They arrive signed and ready from the API (`25` §4.5); the client only
 * derives the small variant: the same address with `.s.jpg` (480 px), which exists only for the media form
 * `…/<digits>/<digits>.jpg?…` (WP-12, RES-001). Legacy matched the relative `/media/<n>/<n>.jpg?`; HOMI's addresses
 * are absolute, so the rule reads the end of the path.
 */

/** `sizes` of a feed photo: the full column, at most 608 px wide (`03` SCR-007). */
export const PHOTO_SIZES = "(min-width: 640px) 608px, calc(100vw - 32px)";

/** `sizes` of the photo of the compact card (the map card, WP-27). */
export const COMPACT_PHOTO_SIZES = "112px";

/** The path (no `?` or `#` before it) ends in `/<digits>/<digits>.jpg` and a query follows. */
const MEDIA_PHOTO = /^([^?#]*\/\d+\/\d+)\.jpg\?/;

/** Connections that load only the small variant (legacy: `slow-2g`, `2g`, `3g`). */
const SLOW_CONNECTIONS: ReadonlySet<string> = new Set(["slow-2g", "2g", "3g"]);

/** The small variant of a media photo, or `null` for any other address. */
export function smallPhotoUrl(url: string): string | null {
  return MEDIA_PHOTO.test(url) ? url.replace(MEDIA_PHOTO, "$1.s.jpg?") : null;
}

/** The small variant when there is one, else the address itself (thumbnails of WP-29 and WP-30). */
export function thumbUrl(url: string): string {
  return smallPhotoUrl(url) ?? url;
}

/** What the network rule reads: `navigator.connection` (Network Information API) and lite graphics. */
export interface NetworkProfile {
  saveData?: boolean;
  /** `slow-2g`, `2g`, `3g` or `4g`. */
  effectiveType?: string;
  lite?: boolean;
}

type Connection = { saveData?: boolean; effectiveType?: string };

/** The current network and graphics; on the server nothing is known, so the full set is offered. */
export function currentNetwork(): NetworkProfile {
  if (typeof navigator === "undefined") {
    return {};
  }
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  return { saveData: connection?.saveData, effectiveType: connection?.effectiveType, lite: isLiteGraphics() };
}

/** Save-Data, a connection of 3g or slower, or lite graphics: only the small variant is requested (BR-APP-059). */
export function smallPhotosOnly(network: NetworkProfile = currentNetwork()): boolean {
  return Boolean(network.saveData) || SLOW_CONNECTIONS.has(network.effectiveType ?? "") || Boolean(network.lite);
}

export interface PhotoSources {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * The `<img>` sources of a photo. Without `sizes` (a full-size view) or without a small variant: the address alone.
 * With `smallOnly`: the small variant alone. Otherwise `srcset` with 480w and 800w. `smallOnly` is a parameter, so
 * a component can pass a value that is the same on the server and in the first client render.
 */
export function photoSources(url: string, sizes?: string, smallOnly: boolean = smallPhotosOnly()): PhotoSources {
  const small = sizes ? smallPhotoUrl(url) : null;
  if (small === null) {
    return { src: url };
  }
  if (smallOnly) {
    return { src: small };
  }
  return { src: url, srcSet: `${small} 480w, ${url} 800w`, sizes };
}
