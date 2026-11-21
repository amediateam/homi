"use client";

import { Button, ErrorState, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { RouteOverlay } from "@/features/shell/RouteOverlay";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { createOwnerListing } from "@/lib/actions/owner";
import { useAction } from "@/lib/actions/useAction";
import type { ApiFailure } from "@/lib/api/errors";
import { takeOverBack } from "@/lib/navigation/backHandler";
import { nav } from "@/lib/navigation/nav";
import { currentAddress } from "@/lib/navigation/address";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { usePathname } from "@/i18n/navigation";
import { useReference } from "@/lib/reference/useReference";
import { showToast } from "@/lib/ui/toast";

import { closeOwnerForm, markOwnerFormOpened, openMyListings } from "./closeOwnerForm";
import { normalizeOwnerListing } from "./normalize";
import { OwnerFrame } from "./OwnerFrame";
import { invalidateOwner, putOwnerListing } from "./store";
import { useOwnerOffRedirect } from "./useOwnerOffRedirect";

type State = { kind: "creating" } | { kind: "limit"; max: number } | { kind: "error"; failure: ApiFailure };

/**
 * `/owner/new` (WP-81, SCR-050, BR-APP-075, DEV-054): the frame «Сдать квартиру» with a spinner while
 * `createOwnerListing()` answers — once, when the reference data says the cabinet is on — then a replace to the draft:
 * step «where» (`/owner/<id>/place?first=1`) for a draft without a point, else the questionnaire. The answer is the
 * caller's untouched draft when one exists, so backing out of the first map step leaves no new empty draft behind.
 * `409 owner_limit` shows the limit state with «Мои объявления»; `403 owner_disabled` closes with a toast; any other
 * failure a tall error whose «Повторить» posts again. Back and the swipe close the form.
 */
export function OwnerNewRoute({ presentation }: { presentation: RoutePresentation }) {
  // Next keeps a visited route alive (`<Activity>`): a second push of `/owner/new` in one launch (the settings row,
  // «Сдать ещё одну», the invitations of WP-82) must start a new opening, not show the kept one with its create sent.
  // `bfcacheId` changes on every push or replace and stays on Back/Forward.
  const { bfcacheId } = useRouter();
  return <OwnerNewOpening key={bfcacheId} presentation={presentation} />;
}

function OwnerNewOpening({ presentation }: { presentation: RoutePresentation }) {
  const t = useTranslations();
  const off = useOwnerOffRedirect();
  const { loaded, ownerEnabled, ownerListingsLimit } = useReference();
  const create = useAction(createOwnerListing);
  const [state, setState] = useState<State>({ kind: "creating" });
  const started = useRef(false);

  useLayoutEffect(() => markOwnerFormOpened(), []);
  const close = useCallback(() => void closeOwnerForm(), []);
  // Loaded directly, this page stays below the form's overlay copy: it owns Back only at its own address.
  const atNew = matchRoute(usePathname()).route === "ownerNew";
  useLayoutEffect(() => (atNew ? takeOverBack(close) : undefined), [atNew, close]);

  const run = useCallback(async () => {
    setState({ kind: "creating" });
    const from = currentAddress();
    const result = await create({});
    // Back closed the form meanwhile: the draft is kept, nothing is navigated over the page the user went to.
    const left = currentAddress() !== from;
    if (result.ok) {
      const listing = normalizeOwnerListing(result.data);
      if (listing === null) {
        setState({ kind: "error", failure: { ok: false, error: "server", status: 200, method: "POST", path: "owner/listings" } });
        return;
      }
      putOwnerListing(result.data);
      invalidateOwner();
      if (left) {
        return;
      }
      const placed = listing.form.lat !== null && listing.form.lon !== null;
      nav.replace(placed || listing.status !== "draft" ? routes.ownerForm(listing.id) : routes.ownerPlace(listing.id, { first: 1 }));
      return;
    }
    if (result.code === "owner_disabled") {
      showToast({ key: "own.disabled" });
      close();
      return;
    }
    if (result.code === "owner_limit") {
      setState({ kind: "limit", max: result.detail?.max ?? ownerListingsLimit });
      return;
    }
    setState({ kind: "error", failure: result });
  }, [create, close, ownerListingsLimit]);

  useEffect(() => {
    if (loaded && ownerEnabled && !started.current) {
      started.current = true;
      void run();
    }
  }, [loaded, ownerEnabled, run]);

  if (off) {
    return null;
  }

  let content;
  if (state.kind === "limit") {
    content = (
      <OwnerFrame title={t("own.limitTitle", { max: state.max })} data-state="limit">
        <p className="text-[15px] leading-[1.45] text-text">{t("own.limitText", { max: state.max })}</p>
        <Button className="mt-5 w-full" onClick={() => void openMyListings()}>
          {t("own.mine")}
        </Button>
      </OwnerFrame>
    );
  } else if (state.kind === "error") {
    const offline = state.failure.error === "offline" || state.failure.error === "timeout";
    content = (
      <OwnerFrame title={t("own.title")} data-state="error">
        <ErrorState
          tall
          kind={offline ? "offline" : "server"}
          title={offline ? t("error.offline") : t("common.loadFailed")}
          text={offline ? t("error.offlineText") : t("error.serverText")}
          retryLabel={t("error.retry")}
          onRetry={() => void run()}
        />
      </OwnerFrame>
    );
  } else {
    content = (
      <OwnerFrame title={t("own.title")} data-state="creating">
        <div className="grid place-items-center py-16">
          <Spinner aria-label={t("own.title")} />
        </div>
      </OwnerFrame>
    );
  }

  return (
    <RouteOverlay presentation={presentation} className="z-(--z-owner)" swipeBack={presentation === "layer"} onClose={close} entrance={presentation === "layer"}>
      <div data-route="owner-new" data-layer={presentation === "layer" ? "overlay" : undefined} className="min-h-full">
        {content}
      </div>
    </RouteOverlay>
  );
}
