import { notFound } from "next/navigation";

/** Any address under a locale that no route matches renders `[locale]/not-found.tsx` with status 404 (WP-20). */
export default function UnknownAddress(): never {
  notFound();
}
