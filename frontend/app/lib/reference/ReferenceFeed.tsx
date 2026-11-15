import type { Locale } from "@homi/config";

import { ReferenceProvider } from "./ReferenceProvider";
import { getCities, getReference } from "./server";

/** The root layout's reader of the cached reference data (WP-22); rendered inside `<Suspense>`. */
export async function ReferenceFeed({ locale }: { locale: Locale }) {
  const [reference, cities] = await Promise.all([getReference(locale), getCities(locale)]);
  return <ReferenceProvider reference={reference} cities={cities} />;
}
