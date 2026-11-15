import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** New radar (SCR-030); WP-30 replaces the placeholder. Intercepted into the sheet slot. */
export default function Page() {
  return <RoutePlaceholder name="radars/new" layer="sheet" />;
}
