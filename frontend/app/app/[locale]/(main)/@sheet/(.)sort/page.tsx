import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** Sort (SCR-016); WP-25 replaces the placeholder. Intercepted into the sheet slot. */
export default function Page() {
  return <RoutePlaceholder name="sort" layer="sheet" />;
}
