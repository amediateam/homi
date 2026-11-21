"use client";

import { ErrorState, Spinner, useBodyClass } from "@homi/ui";
import { notFound, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, use, useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { RouteOverlay } from "@/features/shell/RouteOverlay";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { usePathname } from "@/i18n/navigation";
import { takeOverBack } from "@/lib/navigation/backHandler";
import { useDepth } from "@/lib/navigation/history";
import { isOwnerId, matchRoute } from "@/lib/navigation/routes";
import { showToast } from "@/lib/ui/toast";

import { closeOwnerForm, forgetOwnerForm, markOwnerFormOpened } from "./closeOwnerForm";
import { normalizeOwnerListing } from "./normalize";
import { Questionnaire } from "./form/Questionnaire";
import { OwnerFrame } from "./OwnerFrame";
import { type OwnerListingBody, useOwnerListing } from "./store";
import { useOwnerOffRedirect } from "./useOwnerOffRedirect";

export interface OwnerFormLayerProps {
  /** The layout's own `params`: a hidden copy of another form keeps its id. */
  params: Promise<{ id: string }>;
  presentation: RoutePresentation;
  /** The listing read on the server with the cookie, when the page had one. */
  initial?: OwnerListingBody;
  /** The step of the address (the picker, the phone, the mode, the done step), over the questionnaire. */
  children?: ReactNode;
}

/**
 * The owner form's layer (WP-81, SCR-050 … SCR-056): the one owner of `RouteOverlay` for `/owner/<id>` and its steps,
 * in both route trees, raised to `--z-owner` (46), holding `body.listing-open` as legacy `OwnerLayer` does. The id
 * comes from the layout's own `params`; one that is not a ULID renders nothing in the slot and is not found on a direct
 * load. It reads its listing (the server's copy as `initial`, else through `/bff`) and shows the loading frame, the
 * error with «Повторить», or the questionnaire with the step of the address below it. While the cabinet is switched
 * off (DEC-81) it renders nothing and the settings tab replaces it; a `403 owner_disabled` closes it with a toast.
 *
 * Telegram's Back and the fallback cross close the form (`closeOwnerForm`) at the questionnaire, the done step and the
 * first placing; at the other steps Back is the app's (back to the questionnaire, or the picker's own).
 */
export function OwnerFormLayer({ params, presentation, initial, children }: OwnerFormLayerProps) {
  const id = use(params).id;
  const valid = isOwnerId(id);
  if (!valid && presentation === "standalone") {
    notFound();
  }
  return valid ? (
    <OwnerFormLayerBody id={id} presentation={presentation} initial={initial}>
      {children}
    </OwnerFormLayerBody>
  ) : null;
}

function OwnerFormLayerBody({ id, presentation, initial, children }: Omit<OwnerFormLayerProps, "params"> & { id: string }) {
  const t = useTranslations();
  const off = useOwnerOffRedirect();
  const resource = useOwnerListing(off ? null : id, initial === undefined ? {} : { initial });
  const listing = normalizeOwnerListing(resource.data);
  useBodyClass("listing-open");

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = matchRoute(pathname);
  const step = route.route === "owner" && route.id === id ? route.step : undefined;
  const closesForm = step === null || step === "done" || (step === "place" && searchParams.has("first"));
  const depth = useDepth();

  useLayoutEffect(() => {
    markOwnerFormOpened();
    return () => forgetOwnerForm();
  }, []);

  const close = useCallback(() => void closeOwnerForm(), []);
  useLayoutEffect(() => (closesForm ? takeOverBack(close) : undefined), [closesForm, close]);

  const disabled = resource.error?.code === "owner_disabled";
  const told = useRef(false);
  useEffect(() => {
    if (disabled && !told.current) {
      told.current = true;
      showToast({ key: "own.disabled" });
      close();
    }
  }, [disabled, close]);

  if (off) {
    return null;
  }

  let content: ReactNode;
  if (listing !== null) {
    content = (
      <>
        <Questionnaire key={listing.id} listing={listing}>
          {children}
        </Questionnaire>
      </>
    );
  } else if (resource.error !== null && !disabled) {
    content = (
      <OwnerFrame title={t("own.title")}>
        <ErrorState
          tall
          kind={resource.error.error === "offline" || resource.error.error === "timeout" ? "offline" : "server"}
          title={resource.error.error === "offline" ? t("error.offline") : t("common.loadFailed")}
          text={resource.error.error === "offline" ? t("error.offlineText") : t("error.serverText")}
          retryLabel={t("error.retry")}
          onRetry={() => void resource.refetch()}
        />
      </OwnerFrame>
    );
  } else {
    content = (
      <OwnerFrame title={t("own.title")} data-state="loading">
        <div className="grid place-items-center py-16">
          <Spinner aria-label={t("own.title")} />
        </div>
      </OwnerFrame>
    );
  }

  return (
    <RouteOverlay
      presentation={presentation}
      className="z-(--z-owner)"
      swipeBack={closesForm && depth > 0 && step !== "place"}
      onClose={close}
      entrance={presentation === "layer"}
    >
      <div data-route="owner" data-owner-id={id} data-layer={presentation === "layer" ? "overlay" : undefined} className="min-h-full">
        {content}
      </div>
    </RouteOverlay>
  );
}
