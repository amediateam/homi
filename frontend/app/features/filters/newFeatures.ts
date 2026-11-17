import { useSyncExternalStore } from "react";

import { NEW_FEATURES, storageGet, storageSet, subscribeStorage } from "@/lib/storage";

/** A feature that carries the «Новое» pill until the user has tried it (`homi-new-<feature>` of `lib/storage.ts`). */
export type NewFeature = (typeof NEW_FEATURES)[number];

/**
 * The feature has not been tried on this device or, through DeviceStorage, on another one (BR-APP-057, legacy
 * `kv-new-pets`). Whether the server announces the feature (`features` of `GET /reference`) is the caller's half of
 * the pill's rule.
 */
export function isNewFeature(feature: NewFeature): boolean {
  return storageGet(`homi-new-${feature}`) === null;
}

/** The first tap on the feature's control hides the pill for good (BR-APP-057); a marked feature stays as it is. */
export function markFeatureSeen(feature: NewFeature): void {
  if (isNewFeature(feature)) {
    storageSet(`homi-new-${feature}`, "1");
  }
}

/**
 * `isNewFeature` for a render: it follows `markFeatureSeen` and the DeviceStorage restore (`subscribeStorage`). The
 * server knows no marker, so the server render and the hydration render say `false` and the pill appears on the
 * next render, as the saved city of `useSearchState` does.
 */
export function useNewFeature(feature: NewFeature): boolean {
  return useSyncExternalStore(
    subscribeStorage,
    () => isNewFeature(feature),
    () => false,
  );
}
