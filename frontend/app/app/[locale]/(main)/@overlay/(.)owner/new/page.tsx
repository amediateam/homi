import { OwnerNewRoute } from "@/features/owner/OwnerNewRoute";

/** The owner form's new draft (SCR-050, BR-APP-075). Intercepted into the overlay slot. */
export default function Page() {
  return <OwnerNewRoute presentation="layer" />;
}
