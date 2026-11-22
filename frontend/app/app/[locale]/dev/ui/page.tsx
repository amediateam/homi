import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The primitives gallery (WP-23, D-E-4), used by review on a device, `crash.spec.ts` and `errors.spec.ts` of WP-32.
 * Any other build — production above all — answers with the not-found screen. `NEXT_PUBLIC_APP_ENV` is inlined at
 * build time, so the answer is fixed per build, whatever the server's environment says later. The import sits in the
 * branch the bundler drops when the comparisons fold to false, so another build emits no gallery chunk at all (WP-33
 * bundle check, row 3).
 */
export default async function Page() {
  // The builds that show the gallery: a developer machine, the end-to-end build (WP-21) and staging. Each comparison
  // names the variable itself, so the bundler sees constants once it is inlined.
  if (process.env.NEXT_PUBLIC_APP_ENV === "local" || process.env.NEXT_PUBLIC_APP_ENV === "ci" || process.env.NEXT_PUBLIC_APP_ENV === "staging") {
    const { UiGallery } = await import("@/features/gallery/UiGallery");
    return <UiGallery />;
  }
  notFound();
}
