"use client";

import { useReference } from "@/lib/reference/useReference";

/**
 * The radar screens exist (WP-24 seam): a build-time constant that only orders the frontend packages. WP-30 turned
 * it on with its screens and the subscribe flow, so from here on the server's switch alone decides.
 */
export const radarsReady = true;

/**
 * What every radar entry point asks (DEC-51): `true` only when the radar screens exist and the server's switch
 * `radars_enabled` of `GET /reference` is `true`, so it is `false` while the reference data is missing (WP-22).
 * `ready` stands for `radarsReady`; a test passes `false` to see an entry point without the radar screens.
 */
export function useRadarsEnabled({ ready = radarsReady }: { ready?: boolean } = {}): boolean {
  const { radarsEnabled } = useReference();
  return ready && radarsEnabled;
}
