"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { updateOwnerListing } from "@/lib/actions/owner";
import { useAction } from "@/lib/actions/useAction";
import { usePathname } from "@/i18n/navigation";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";
import { showToast } from "@/lib/ui/toast";
import { labelFor } from "@homi/i18n";

import { useReference } from "@/lib/reference/useReference";

import { closeOwnerForm, openMyListings } from "../closeOwnerForm";
import type { OwnerForm, OwnerListingView } from "../normalize";
import { OwnerFrame } from "../OwnerFrame";
import { PhotoGrid } from "../photos/PhotoGrid";
import { usePhotos } from "../photos/usePhotos";
import { invalidateOwner, type OwnerListingBody, putOwnerListing, useOwnerListings } from "../store";
import { OwnerFormContext } from "./context";
import { DescriptionSection } from "./DescriptionSection";
import { focusField, isFocusToken } from "./focus";
import { FormFooter } from "./FormFooter";
import { PhotosSection } from "./PhotosSection";
import { PlaceSection } from "./PlaceSection";
import { PriceSection } from "./PriceSection";
import { RoomsSection } from "./RoomsSection";
import { couple, defaultsFor, floorAboveFloors, missingParts, NEED_FIELDS, type Need } from "./rules";
import { TenantsSection } from "./TenantsSection";
import { useAutosave } from "./useAutosave";
import { WhereSection } from "./WhereSection";

/**
 * The questionnaire (WP-81, SCR-052; BR-APP-079 … BR-APP-081, BR-APP-093, DEV-058): the sections in their order over
 * the autosave, the welcome line of a returning owner, the footer and «Дальше». It is the layout of the `[id]`
 * segment, so it stays mounted under the picker, the phone and the mode steps and Back finds it as it was.
 */
export function Questionnaire({ listing, usual, children }: { listing: OwnerListingView; usual?: ReactNode; children?: ReactNode }) {
  const t = useTranslations();
  const { me } = useSession();
  const update = useAction(updateOwnerListing);
  const save = useCallback((fields: Partial<OwnerForm>) => update({ id: listing.id, fields }), [update, listing.id]);
  const onSaved = useCallback((data: OwnerListingBody) => {
    putOwnerListing(data);
    invalidateOwner();
  }, []);
  const onDisabled = useCallback(() => {
    showToast({ key: "own.disabled" });
    void closeOwnerForm();
  }, []);
  const autosave = useAutosave({ initial: listing.form, save, onSaved, onDisabled });
  const { ownerPhotosLimit } = useReference();
  const photos = usePhotos({
    listingId: listing.id,
    photos: listing.photos,
    limit: ownerPhotosLimit,
    onDisabled,
    texts: { deleted: t("own.photoDeleted"), undo: t("own.placeUndo") },
  });
  const { form, invalid, error, saving, edit: editRaw, flush, current } = autosave;
  const edit = useCallback((change: Partial<OwnerForm>) => editRaw(couple(form, change)), [editRaw, form]);

  // A draft without a city takes the profile's (BR-APP-080), once.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current) {
      return;
    }
    defaulted.current = true;
    const defaults = defaultsFor(listing.form, me?.city ?? null);
    if (Object.keys(defaults).length > 0) {
      editRaw(defaults);
    }
  }, [editRaw, listing.form, me?.city]);

  // The welcome line of a returning owner (BR-APP-095): a new draft reads the list once.
  const lists = useOwnerListings({ enabled: listing.status === "draft" });
  const others = (lists.data?.items ?? []).filter(
    (item) => item.id !== listing.id && (item.status === "active" || item.status === "paused" || item.status === "draft"),
  );
  const past = lists.data?.past ?? 0;
  const welcome = listing.status === "draft" && past > 0 && others.length === 0 ? t("own.welcome", { n: past }) : null;

  // `?focus=` (BR-APP-093): scroll and highlight, then drop the parameter.
  const root = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const focus = searchParams.get("focus");
  useLayoutEffect(() => {
    if (!isFocusToken(focus) || root.current === null) {
      return;
    }
    const undo = focusField(root.current, focus);
    nav.replace(pathname);
    return undo;
  }, [focus, pathname]);

  const [needs, setNeeds] = useState<Need[]>([]);
  const [failedNext, setFailedNext] = useState(false);
  const highlighted = new Set([...invalid, ...needs.flatMap((need) => NEED_FIELDS[need])]);
  const floorBad = floorAboveFloors(form);

  const onCity = (code: string) => {
    if (code === form.city) {
      return;
    }
    const before = { city: form.city, district_code: form.district_code, lat: form.lat, lon: form.lon };
    edit({ city: code });
    if (before.district_code !== null || before.lat !== null) {
      showToast({ text: t("own.cityChanged"), action: t("own.placeUndo"), run: () => editRaw(before) });
    }
  };

  const onNext = async () => {
    tg.haptic.impact("medium");
    const missing = missingParts(form, photos.photos);
    setNeeds(missing);
    if (missing.length > 0 || floorBad) {
      tg.haptic.warning();
      return;
    }
    const result = await flush();
    if (!result.ok) {
      tg.haptic.error();
      setFailedNext(true);
      return;
    }
    setFailedNext(false);
    nav.push(listing.phoneSet ? routes.ownerMode(listing.id) : routes.ownerPhone(listing.id));
  };

  const what = needs.map((need) => t(labelFor("ownerNeed", need))).join(", ");
  const note =
    needs.length > 0
      ? t("own.needs", { what })
      : floorBad
        ? t("own.floorBad")
        : error === "locked"
          ? t("own.notEditable")
          : error === "offline"
            ? t("own.editOffline")
            : failedNext || error === "failed"
              ? t("own.saveFailed")
              : invalid.size > 0
                ? t("own.fixFields")
                : null;

  return (
    <OwnerFormContext value={{ listing, form, edit, restore: editRaw, flush, current }}>
    <div ref={root} data-owner-questionnaire="">
      <OwnerFrame
        title={listing.status === "draft" ? t("own.title") : t("own.editTitle")}
        subtitle={t("own.subtitle")}
        data-state="form"
        footer={
          <FormFooter
            note={note}
            locked={listing.locked || error === "locked"}
            phoneSet={listing.phoneSet}
            busy={saving || photos.busy}
            onNext={() => void onNext()}
            onMine={() => void openMyListings()}
          />
        }
      >
        <div className="flex flex-col gap-5">
          {welcome === null ? null : (
            <p data-owner-welcome="" className="rounded-medium bg-fill px-3 py-2.5 text-[14px] leading-[1.4] text-text">
              {welcome}
            </p>
          )}
          <PlaceSection
            form={form}
            shownPoint={listing.shownPoint}
            invalid={highlighted.has("landmark") || highlighted.has("lat")}
            pointRefused={invalid.has("lat")}
            onLandmark={(landmark) => edit({ landmark })}
            onMap={() => nav.push(routes.ownerPlace(listing.id))}
          />
          <PhotosSection photos={photos.photos} invalid={highlighted.has("photos")}>
            <PhotoGrid
              photos={photos.photos}
              tiles={photos.tiles}
              arrived={photos.arrived}
              busy={photos.busy}
              error={photos.error}
              limit={ownerPhotosLimit}
              onAdd={(files) => void photos.add(files)}
              onCover={(id) => void photos.makeCover(id)}
              onRemove={photos.remove}
            />
          </PhotosSection>
          <WhereSection form={form} invalid={highlighted} onCity={onCity} onDistrict={(district_code) => edit({ district_code })} />
          <RoomsSection form={form} invalid={highlighted} edit={edit} />
          <PriceSection form={form} invalid={highlighted} edit={edit} usual={usual} />
          <TenantsSection form={form} edit={edit} />
          <DescriptionSection value={form.description} onChange={(description) => edit({ description })} />
        </div>
      </OwnerFrame>
    </div>
    {children}
    </OwnerFormContext>
  );
}
