/**
 * The key of a filters form, computed by its `…SheetRoute` with this function only (WP-25 "State and navigation";
 * swap it here if a browser disproves it). `bfcacheId` changes when a push or replace opens the sheet afresh and stays
 * through back/forward and the shallow `pick=city` layer, so every open starts from the address while the nested
 * picker keeps the draft. An address without a city also keys on the city it falls back to: the hydration render of a
 * direct load does not know the saved city yet (`useSearchState`), and the draft must not keep the city it was first
 * seeded with, which an apply would then write (review C-3).
 */
export function formKey(bfcacheId: string, address: Pick<URLSearchParams, "has"> | null, city: string): string {
  return address?.has("city") ? bfcacheId : `${bfcacheId}:${city}`;
}
