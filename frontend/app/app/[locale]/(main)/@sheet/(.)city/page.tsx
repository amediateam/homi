import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** City picker (SCR-017); WP-25 replaces the placeholder. Intercepted into the sheet slot. */
export default function Page() {
  return <RoutePlaceholder name="city" layer="sheet" />;
}
