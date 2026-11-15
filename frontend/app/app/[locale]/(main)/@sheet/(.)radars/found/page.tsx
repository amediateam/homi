import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** «Нашли жильё?» survey (SCR-031); WP-30 replaces the placeholder. Intercepted into the sheet slot. */
export default function Page() {
  return <RoutePlaceholder name="radars/found" layer="sheet" />;
}
