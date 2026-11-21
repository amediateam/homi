"use client";

import { useTranslations } from "next-intl";

import { SubPage } from "@/features/shell/SubPage";

import { RequestList } from "./RequestList";

/**
 * «Отклики» under «Мои объявления» (WP-82, SCR-058): a nested `SubPage` at `/settings/owner/<id>/requests`, the list
 * kept mounted below it with its tab and scroll; Back returns to the list, which the store has already refreshed.
 */
export function OwnerRequestsPage({ listingId }: { listingId: string }) {
  const t = useTranslations();
  return (
    <SubPage data-route="owner/requests" title={t("own.requests")} bare>
      <RequestList listingId={listingId} />
    </SubPage>
  );
}
