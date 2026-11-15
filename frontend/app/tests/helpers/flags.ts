import { type DevFlags, devFlags } from "@/lib/flags";

/**
 * Runs `fn` with the app's flags and `overrides` on top (WP-20). Code under test takes the flags as an argument, as
 * the workspace packages do, so nothing global is changed.
 */
export function withDevFlags<T>(overrides: Partial<DevFlags>, fn: (flags: DevFlags) => T): T {
  return fn({ ...devFlags, ...overrides });
}
