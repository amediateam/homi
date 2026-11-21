"use client";

import type { Translate } from "@homi/i18n/format";
import { AtSign, Button, Phone, cn } from "@homi/ui";
import { useTranslations } from "next-intl";

import { bumpFeedEpoch } from "@/features/feed/feedQuery";
import { forgetFeedScroll } from "@/features/feed/feedScroll";
import { priceLine } from "@/features/feed/cardText";
import { Photo } from "@/features/feed/Photo";
import { unblockAuthorById, unhideAll, unhideListing } from "@/lib/actions/hidden";
import { useAction } from "@/lib/actions/useAction";
import { setPreview } from "@/lib/data/previewCache";
import { resetHidden } from "@/lib/data/sessionMaps";
import { invalidate } from "@/lib/data/useResource";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { SettingsGroup } from "./SettingsParts";
import { type Hidden, type HiddenAuthor, useHidden } from "./useHidden";

type HiddenListing = Hidden["listings"][number];

/** An entry's identity in its list: an author by entry id, a listing by number. */
const authorId = (author: HiddenAuthor) => author.id;
const listingNumber = (listing: HiddenListing) => listing.number;

/**
 * The rows a failed change puts back (legacy `applyChange`): of the rows before the change, those still shown now
 * and those this change removed — never one another action returned meanwhile.
 */
function restore<T>(before: readonly T[], after: readonly T[], now: readonly T[], id: (item: T) => string | number): T[] {
  const removed = new Set(before.filter((item) => !after.some((next) => id(next) === id(item))).map(id));
  const shown = new Set(now.map(id));
  return before.filter((item) => shown.has(id(item)) || removed.has(id(item)));
}

/** Everything that shows hidden items reads again once the list changed on the server. */
function hiddenChanged(): void {
  resetHidden();
  bumpFeedEpoch();
  forgetFeedScroll();
  invalidate("radars");
}

/** «N объявлений» or «сейчас нет объявлений». */
function authorCount(count: number, t: Translate): string {
  return count > 0 ? `${count} ${t("listings", { n: count })}` : t("hidden.noListings");
}

const ROW = "relative flex min-h-[60px] w-full items-center gap-[12px] py-[8px] pr-[10px] pl-[14px]";
const SEPARATOR =
  "not-first:before:pointer-events-none not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:border-t-[0.5px] not-first:before:border-sep";
const RETURN = "h-[32px] flex-none rounded-pill bg-bg px-[14px] text-[14px] font-semibold text-text outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70";

/**
 * «Скрытое» (WP-31, SCR-039; legacy `HiddenScreen.jsx`): the intro, the blocked authors (a phone or a channel, its
 * label masked for a phone, «Номер» or «Канал» · «N объявлений») and the hidden listings (thumbnail, price or «Цена
 * договорная», title · district; a tap opens it over the list), each with «Вернуть», and «Показать всё снова», which
 * asks first. Every change is optimistic: a light impact, the rows leave at once, then the request; a success plays
 * the success haptic and makes the feed, its scroll memory, the session's hidden map and the radar previews read
 * again, so returned items show without a refresh; a failure puts back only what that change removed, with
 * `failed()`. An empty list says «Ничего не скрыто» and the page stays open.
 */
export function HiddenPage() {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const view = useHidden();
  const returnAuthor = useAction(unblockAuthorById);
  const returnListing = useAction(unhideListing);
  const returnAll = useAction(unhideAll);
  const hidden = view.hidden;
  if (hidden === null) {
    return null;
  }

  const change = (after: Hidden, request: () => Promise<{ ok: boolean }>) => {
    const before = hidden;
    tg.haptic.impact("light");
    view.set(after);
    void request()
      .catch(() => ({ ok: false }))
      .then((result) => {
        if (result.ok) {
          tg.haptic.success();
          hiddenChanged();
          return;
        }
        const now = view.current();
        view.set({
          authors: restore(before.authors, after.authors, now.authors, authorId),
          listings: restore(before.listings, after.listings, now.listings, listingNumber),
        });
        failed();
      });
  };

  const empty = hidden.authors.length + hidden.listings.length === 0;
  return (
    <div data-hidden-page="">
      <p className="mx-[4px] -mt-[4px] mb-[18px] text-[13px] leading-[1.4] text-hint">{t("hidden.intro")}</p>
      {empty ? <p className="px-[4px] py-[24px] text-center text-hint">{t("hidden.empty")}</p> : null}
      <div className="flex flex-col gap-[22px]">
        {hidden.authors.length > 0 ? (
          <SettingsGroup id="authors" title={t("hidden.authors")}>
            {hidden.authors.map((author) => {
              const phone = author.kind === "phone";
              const channel = author.kind === "source" || author.kind === "channel";
              return (
                <div key={author.id} data-hidden-author={author.id} className={cn(ROW, SEPARATOR, "not-first:before:left-[56px]")}>
                  <span aria-hidden className="grid size-[30px] flex-none place-items-center rounded-[9px] bg-bg text-text">
                    {phone ? <Phone size={18} /> : <AtSign size={18} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                    <b className={cn("truncate text-[16px] font-semibold text-text", phone && "ph-mask")}>{author.label}</b>
                    <span className="truncate text-[13px] text-hint">
                      {phone || channel ? `${t(phone ? "hidden.phone" : "hidden.channel")} · ` : ""}
                      {authorCount(author.count, translate)}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-hidden-return="author"
                    className={RETURN}
                    onClick={() => change({ ...hidden, authors: hidden.authors.filter((item) => item.id !== author.id) }, () => returnAuthor({ id: author.id }))}
                  >
                    {t("hidden.return")}
                  </button>
                </div>
              );
            })}
          </SettingsGroup>
        ) : null}
        {hidden.listings.length > 0 ? (
          <SettingsGroup id="listings" title={t("hidden.listings")}>
            {hidden.listings.map((listing) => {
              const price = priceLine(listing, translate);
              const line = [listing.title, listing.district?.name].filter((part) => typeof part === "string" && part !== "").join(" · ");
              return (
                <div key={listing.number} data-hidden-listing={listing.number} className={cn(ROW, SEPARATOR, "not-first:before:left-[70px]")}>
                  <button
                    type="button"
                    data-hidden-open={listing.number}
                    className="flex min-w-0 flex-1 items-center gap-[12px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      tg.haptic.impact("light");
                      setPreview(listing.number, listing);
                      nav.push(routes.listing(listing.number));
                    }}
                  >
                    <span aria-hidden className="relative size-[44px] flex-none overflow-hidden rounded-[10px] bg-bg">
                      {listing.photos.cover ?? listing.photos.preview[0] ? <Photo src={listing.photos.cover ?? listing.photos.preview[0] ?? null} sizes="44px" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                      <b className="truncate text-[16px] font-semibold text-text">{price.negotiable ? price.amount : `${price.amount}${price.period}`}</b>
                      <span className="truncate text-[13px] text-hint">{line}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    data-hidden-return="listing"
                    className={RETURN}
                    onClick={() =>
                      change({ ...hidden, listings: hidden.listings.filter((item) => item.number !== listing.number) }, () => returnListing({ number: listing.number }))
                    }
                  >
                    {t("hidden.return")}
                  </button>
                </div>
              );
            })}
          </SettingsGroup>
        ) : null}
      </div>
      {empty ? null : (
        <Button
          variant="text"
          data-hidden-all=""
          className="mx-auto mt-[22px] flex px-[16px] text-[15px]"
          onClick={() => {
            void tg.confirm(t("hidden.confirmAll")).then((yes) => {
              if (yes) {
                change({ authors: [], listings: [] }, () => returnAll(null));
              }
            });
          }}
        >
          {t("hidden.all")}
        </Button>
      )}
    </div>
  );
}
