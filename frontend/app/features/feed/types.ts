import type { components } from "@homi/types";

/**
 * An item of every listing list (`GET /listings`, `/favorites`, `/history`; WP-12): the card's data. The display
 * strings arrive formatted (`25` §4.5); the helpers of this folder only choose and join them.
 */
export type ListingPreview = components["schemas"]["ListingPreviewResource"];
