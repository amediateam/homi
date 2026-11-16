import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UiGallery } from "@/features/gallery/UiGallery";

/** The builds that show the gallery: a developer machine, the end-to-end build (WP-21) and staging. */
const GALLERY_ENVS = ["local", "ci", "staging"];

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The primitives gallery (WP-23, D-E-4), used by review on a device, `crash.spec.ts` and `errors.spec.ts` of WP-32.
 * Any other build — production above all — answers with the not-found screen. `NEXT_PUBLIC_APP_ENV` is inlined at
 * build time, so the answer is fixed per build, whatever the server's environment says later. The guard blocks the
 * rendering only: the import below is static, so a production build still emits the gallery's client chunk under
 * `.next/static` (reachable by its file name, rendered by no route). WP-33 removes the page or confirms the guard
 * with that known.
 */
export default function Page() {
  if (!GALLERY_ENVS.includes(process.env.NEXT_PUBLIC_APP_ENV ?? "")) {
    notFound();
  }
  return <UiGallery />;
}
