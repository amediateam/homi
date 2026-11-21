"use client";

import { House, ListChecks } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { SettingsGroup, SettingsRow } from "@/features/settings/SettingsParts";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { normalizeOwnerListing, type OwnerListingView } from "../normalize";
import { mineRowValue } from "../status";
import { useOwnerPending } from "../pending";
import { useOwnerEnabled, useOwnerListings } from "../store";

/**
 * The group «Сдаю квартиру» of Settings (WP-82, SCR-032, DEC-81): «Сдать квартиру» while the cabinet is on —
 * «Бесплатно», or «{n} из {max}» when the list says `can_add: false` (a tap then opens the limit sheet) — and «Мои
 * объявления» for a user whose `GET /me` says `owner.has_listings`, with the first value that applies and the red
 * counter of the pending requests. `GET /owner/listings` is read only for such a user (default (a)); while it loads
 * or after it failed the limit is not checked and errors are silent. Off, a user without listings sees no group.
 */
export function OwnerGroup() {
  const t = useTranslations();
  const cabinetOn = useOwnerEnabled();
  const { pending, hasListings } = useOwnerPending();
  const list = useOwnerListings({ enabled: hasListings });
  const body = hasListings ? list.data : undefined;
  const items = useMemo(
    () => (body?.items ?? []).map(normalizeOwnerListing).filter((item): item is OwnerListingView => item !== null),
    [body],
  );
  if (!cabinetOn && !hasListings) {
    return null;
  }
  const full = body !== undefined && body.can_add === false;
  const mine = mineRowValue(items, pending);
  const mineValue = mine === null ? "" : "count" in mine ? String(mine.count) : t(mine.key, mine.values);

  return (
    <SettingsGroup id="owner" title={t("own.group")}>
      {cabinetOn ? (
        <SettingsRow
          id="owner-new"
          icon={<House size={18} />}
          label={t("own.title")}
          value={full ? t("own.limitValue", { n: body.max, max: body.max }) : t("own.free")}
          onClick={() => {
            tg.haptic.impact("light");
            nav.push(full ? routes.ownerLimit({ where: "settings" }) : routes.ownerNew());
          }}
        />
      ) : null}
      {hasListings ? (
        <SettingsRow
          id="owner-mine"
          icon={<ListChecks size={18} />}
          label={t("own.mine")}
          value={mineValue}
          count={pending}
          onClick={() => {
            tg.haptic.impact("light");
            nav.push(routes.ownerListings());
          }}
        />
      ) : null}
    </SettingsGroup>
  );
}
