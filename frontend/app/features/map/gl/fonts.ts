import type { FontFacesSpecification } from "maplibre-gl";

/**
 * The label fonts of the vector basemap (WP-27): Noto Sans 2.015 under OFL 1.1 (`public/map-fonts/OFL.txt`),
 * subset into latin, latin-ext, cyrillic and cyrillic-ext. MapLibre 6 reads them from the style's `font-faces`; a key
 * must equal the `text-font` name, the weight comes from the file, a file is fetched only when a codepoint it covers
 * is first drawn, and a codepoint outside every face is drawn with a local font. There is no `glyphs` URL.
 */

export const FONT_REGULAR = "Noto Sans Regular";
export const FONT_MEDIUM = "Noto Sans Medium";
export const FONT_SEMIBOLD = "Noto Sans SemiBold";

export type MapFont = typeof FONT_REGULAR | typeof FONT_MEDIUM | typeof FONT_SEMIBOLD;

/** The ranges the files were subset with (`pyftsubset --unicodes=…`), in lookup order: the first covering face wins. */
const SUBSETS = [
  [
    "latin",
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  ],
  [
    "latin-ext",
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  ],
  ["cyrillic", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["cyrillic-ext", "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"],
] as const;

function facesOf(weight: 400 | 500 | 600) {
  // One range per element: MapLibre's validator refuses a CSS comma list.
  return SUBSETS.map(([subset, ranges]) => ({
    url: `/map-fonts/noto-sans-${subset}-${weight}.woff2`,
    "unicode-range": ranges.split(","),
  }));
}

/** `font-faces` of the vector style; `gl/style.ts` keeps only the fonts its layers use. */
export const FONT_FACES = {
  [FONT_REGULAR]: facesOf(400),
  [FONT_MEDIUM]: facesOf(500),
  [FONT_SEMIBOLD]: facesOf(600),
} satisfies FontFacesSpecification;
