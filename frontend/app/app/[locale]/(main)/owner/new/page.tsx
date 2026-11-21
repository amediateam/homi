import { OwnerNewRoute } from "@/features/owner/OwnerNewRoute";

/** The owner form's new draft (SCR-050, BR-APP-075). Direct load, shown as the standalone layer. */
export default function Page() {
  return <OwnerNewRoute presentation="standalone" />;
}
