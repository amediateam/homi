import { afterEach, describe, expect, it } from "vitest";

import {
  COMPACT_PHOTO_SIZES,
  currentNetwork,
  photoSources,
  PHOTO_SIZES,
  smallPhotosOnly,
  smallPhotoUrl,
  thumbUrl,
} from "@/features/feed/images";

const MEDIA = "https://cdn.homi.loc/stub/100001/1.jpg?e=0&s=stub";
const SMALL = "https://cdn.homi.loc/stub/100001/1.s.jpg?e=0&s=stub";

afterEach(() => {
  Reflect.deleteProperty(navigator, "connection");
  window.localStorage.clear();
  document.documentElement.className = "";
});

describe("BR-APP-059: the small variant", () => {
  it("is derived for a media address `…/<digits>/<digits>.jpg?…`, keeping the query", () => {
    expect(smallPhotoUrl(MEDIA)).toBe(SMALL);
    expect(smallPhotoUrl("https://cdn.homi.uz/media/48213/2.jpg?e=1731600000&s=abc")).toBe(
      "https://cdn.homi.uz/media/48213/2.s.jpg?e=1731600000&s=abc",
    );
    expect(thumbUrl(MEDIA)).toBe(SMALL);
  });

  it("is not derived for any other address, which is used as it is", () => {
    for (const url of [
      "https://example.com/photos/a.jpg?x=1",
      "https://cdn.homi.loc/stub/100001/1.jpg",
      "https://cdn.homi.loc/stub/100001/1.png?e=0",
      "https://cdn.homi.loc/stub/cover/1.jpg?e=0",
      "https://cdn.homi.loc/photo?u=/1/2.jpg?x",
    ]) {
      expect(smallPhotoUrl(url), url).toBeNull();
      expect(thumbUrl(url), url).toBe(url);
      expect(photoSources(url, PHOTO_SIZES, false), url).toEqual({ src: url });
    }
  });
});

describe("BR-APP-059: the network rule", () => {
  it("asks for the small variant only on Save-Data, 3g or slower, or lite graphics", () => {
    expect(smallPhotosOnly({ saveData: true, effectiveType: "4g" })).toBe(true);
    expect(smallPhotosOnly({ effectiveType: "slow-2g" })).toBe(true);
    expect(smallPhotosOnly({ effectiveType: "2g" })).toBe(true);
    expect(smallPhotosOnly({ effectiveType: "3g" })).toBe(true);
    expect(smallPhotosOnly({ lite: true })).toBe(true);
    expect(smallPhotosOnly({ effectiveType: "4g" })).toBe(false);
    expect(smallPhotosOnly({})).toBe(false);
  });

  it("small only: the small variant alone", () => {
    expect(photoSources(MEDIA, PHOTO_SIZES, true)).toEqual({ src: SMALL });
  });

  it("otherwise: srcset with 480w and 800w and the sizes of the card", () => {
    expect(photoSources(MEDIA, PHOTO_SIZES, false)).toEqual({
      src: MEDIA,
      srcSet: `${SMALL} 480w, ${MEDIA} 800w`,
      sizes: "(min-width: 640px) 608px, calc(100vw - 32px)",
    });
    expect(photoSources(MEDIA, COMPACT_PHOTO_SIZES, false).sizes).toBe("112px");
  });

  it("without sizes (a full-size view) the address alone", () => {
    expect(photoSources(MEDIA, undefined, true)).toEqual({ src: MEDIA });
  });

  it("reads navigator.connection and lite graphics by default", () => {
    expect(currentNetwork()).toEqual({ saveData: undefined, effectiveType: undefined, lite: false });
    expect(photoSources(MEDIA, PHOTO_SIZES).srcSet).toBeDefined();

    Object.defineProperty(navigator, "connection", { value: { saveData: false, effectiveType: "3g" }, configurable: true });
    expect(photoSources(MEDIA, PHOTO_SIZES)).toEqual({ src: SMALL });

    Object.defineProperty(navigator, "connection", { value: { saveData: false, effectiveType: "4g" }, configurable: true });
    window.localStorage.setItem("homi-graphics", "lite");
    expect(currentNetwork().lite).toBe(true);
    expect(photoSources(MEDIA, PHOTO_SIZES)).toEqual({ src: SMALL });
  });
});
