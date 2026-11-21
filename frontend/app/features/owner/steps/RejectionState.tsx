"use client";

import { labelFor } from "@homi/i18n";
import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";

import { supportUrl } from "@/lib/deeplinks/build";
import { useReference } from "@/lib/reference/useReference";
import { nav } from "@/lib/navigation/nav";
import { tg } from "@/lib/telegram";

import { openMyListings } from "../closeOwnerForm";
import type { OwnerListingView } from "../normalize";
import { StepFrame } from "./StepFrame";

/**
 * The rejection state (WP-81, SCR-054, BR-APP-085, DEV-056): «Не получилось» and one paragraph by `reject_reason` —
 * `denied` with legacy's `fraud` text, `limit` with its text (the limit from the reference data) and «Мои объявления»;
 * an unknown reason reads as `denied` (`normalize`). The support button opens HOMI's support bot and is hidden
 * without one (DEC-56). No realtor waitlist is offered (DEC-82). Back returns to the questionnaire.
 */
export function RejectionState({ listing }: { listing: OwnerListingView }) {
  const t = useTranslations();
  const { supportUsername, ownerListingsLimit } = useReference();
  const reason = listing.rejectReason ?? "denied";
  const support = supportUsername === null ? null : supportUrl(supportUsername);
  return (
    <StepFrame onClose={() => nav.back()} step="rejected" title={t("own.rejectedTitle")}>
      <p data-reject-reason={reason} className="text-[15px] leading-[1.45] text-text">
        {t(labelFor("ownerReject", reason), { max: ownerListingsLimit })}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        {reason === "limit" ? (
          <Button data-action="mine" onClick={() => void openMyListings()}>
            {t("own.mine")}
          </Button>
        ) : null}
        {support === null ? null : (
          <Button
            variant="secondary"
            data-action="support"
            onClick={() => {
              tg.haptic.impact("light");
              tg.openLink(support);
            }}
          >
            {t("own.support")}
          </Button>
        )}
      </div>
    </StepFrame>
  );
}
