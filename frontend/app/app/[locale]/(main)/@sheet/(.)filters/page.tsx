import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** Full filters (SCR-014); WP-25 replaces the placeholder. Intercepted into the sheet slot. */
export default function Page() {
  return <RoutePlaceholder name="filters" layer="sheet" />;
}
