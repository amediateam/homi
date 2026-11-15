import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** Full filters (SCR-014); WP-25 replaces the placeholder. Direct load; a soft navigation shows the copy in @sheet. */
export default function Page() {
  return <RoutePlaceholder name="filters" />;
}
