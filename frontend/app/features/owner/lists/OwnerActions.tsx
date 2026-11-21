"use client";

import type { MessageKey } from "@homi/i18n";
import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";

import { supportUrl } from "@/lib/deeplinks/build";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import type { OwnerListingView } from "../normalize";
import { actionsOf, type ActionPlace, type OwnerAction } from "../status";
import { useOwnerEnabled } from "../store";
import type { StatusChange } from "./useStatusAction";

const LABEL: Record<OwnerAction, MessageKey> = {
  delete: "own.tab5.delete",
  continue: "own.continue",
  requests: "own.tab5.requests",
  pause: "own.tab5.pause",
  resume: "own.tab5.resume",
  rented: "own.tab5.rented",
  edit: "own.tab5.edit",
  remove: "own.tab5.remove",
  support: "own.support",
  again: "own.tab5.another",
};

const CHANGES: ReadonlySet<OwnerAction> = new Set(["pause", "resume", "rented", "remove", "delete"]);

/** The actions drawn for a listing: `actionsOf`, without «Поддержка» while HOMI has no support bot (DEC-56). */
export function useVisibleActions(listing: OwnerListingView, place: ActionPlace): OwnerAction[] {
  const cabinetOn = useOwnerEnabled();
  const { supportUsername } = useReference();
  return actionsOf(listing, place, { cabinetOn }).filter((action) => action !== "support" || supportUsername !== null);
}

/**
 * The buttons of an owner listing on its card or in the panel's footer (WP-82, BR-APP-088, the table of `actionsOf`):
 * the status changes go through `onChange` (`useStatusAction`), «Отклики» through `onRequests`, «Продолжить» and
 * «Изменить» open the form, «Сдать ещё одну» a new one (no check: the form's limit state answers it, BR-APP-089),
 * «Поддержка» HOMI's support bot — hidden without one (DEC-56). A tap on a button never counts as a tap on the card.
 */
export function OwnerActions({
  listing,
  place,
  busy,
  pending = 0,
  onChange,
  onRequests,
}: {
  listing: OwnerListingView;
  place: ActionPlace;
  busy: boolean;
  /** The badge of «Отклики» in the panel (the requests waiting). */
  pending?: number;
  onChange: (change: StatusChange) => void;
  onRequests: () => void;
}) {
  const t = useTranslations();
  const { supportUsername } = useReference();
  const support = supportUsername === null ? null : supportUrl(supportUsername);
  const actions = useVisibleActions(listing, place);
  if (actions.length === 0) {
    return null;
  }

  const tap = (action: OwnerAction) => {
    if (CHANGES.has(action)) {
      onChange(action as StatusChange);
      return;
    }
    tg.haptic.impact("light");
    switch (action) {
      case "requests":
        onRequests();
        return;
      case "continue":
      case "edit":
        nav.push(routes.ownerForm(listing.id));
        return;
      case "again":
        nav.push(routes.ownerNew());
        return;
      case "support":
        if (support !== null) {
          tg.openLink(support);
        }
        return;
    }
  };

  return (
    <div data-owner-actions={place} className="flex flex-wrap gap-[8px]">
      {actions.map((action, index) => (
        <Button
          key={action}
          type="button"
          size="md"
          variant={action === "continue" || (action === "requests" && place === "panel") ? "primary" : action === "remove" ? "danger" : "secondary"}
          disabled={busy}
          data-action={action}
          // The panel's footer: its first action across the bar, the others side by side under it.
          className={place === "panel" && index === 0 && actions.length > 1 ? "basis-full" : "flex-1"}
          onClick={(event) => {
            event.stopPropagation();
            tap(action);
          }}
        >
          {t(LABEL[action])}
          {action === "requests" && place === "panel" && pending > 0 ? (
            <span data-requests-badge={pending} className="ml-[6px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-[5px] text-[11px] font-semibold text-white">
              {pending}
            </span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
