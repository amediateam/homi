import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OwnerRequestsPage } from "@/features/owner/requests/OwnerRequestsPage";
import { isOwnerId } from "@/lib/navigation/routes";

/** «Отклики» of one owner listing (SCR-058, WP-82), over «Мои объявления»; an id that is not a ULID is not found. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isOwnerId(id)) {
    notFound();
  }
  return (
    <Suspense fallback={null}>
      <OwnerRequestsPage listingId={id} />
    </Suspense>
  );
}
