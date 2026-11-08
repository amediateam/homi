/**
 * Shared UI for landing, app and arm (master prompt §12.3 design system).
 * The design tokens and components arrive with the first product screens; until then this package
 * only fixes the contract every app relies on: a className merger with no runtime dependencies.
 */

export type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, boolean | null | undefined>;

/** Join conditional class names (tiny clsx-compatible subset; swap for clsx + tailwind-merge when tokens land). */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string" || typeof input === "number") {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else {
      for (const [key, enabled] of Object.entries(input)) {
        if (enabled) out.push(key);
      }
    }
  }
  return out.join(" ");
}
