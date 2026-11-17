"use client";

import { useReference } from "@/lib/reference/useReference";

/**
 * The radar screens exist (WP-24 seam): a build-time constant that only orders the frontend packages. WP-30 flips it
 * when its screens and the subscribe flow land; until then no radar entry point renders.
 */
export const radarsReady = false;

/**
 * What every radar entry point asks (DEC-51): `true` only when the radar screens exist and the server's switch
 * `radars_enabled` of `GET /reference` is `true`, so it is `false` while the reference data is missing (WP-22).
 * `ready` stands for `radarsReady`; tests pass `true` to reach the server's half before WP-30 flips the constant.
 */
export function useRadarsEnabled({ ready = radarsReady }: { ready?: boolean } = {}): boolean {
  const { radarsEnabled } = useReference();
  return ready && radarsEnabled;
}
