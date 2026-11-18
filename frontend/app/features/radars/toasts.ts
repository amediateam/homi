import type { Locale } from "@homi/config";
import { formatCount, type Translate } from "@homi/i18n/format";

import type { ToastMessage } from "@/lib/ui/toast";

import type { RadarOption } from "./normalize";

/**
 * The toasts of the subscribe flow (WP-30 "Toasts of the subscribe flow", BR-APP-041, BR-APP-042): one function per
 * outcome of the table, each a finished `ToastMessage`. A plain toast is a catalogue key with its values, translated
 * by the host; the two few toasts carry «Расширить» and so are ready text (an action toast takes no key). `{count}`
 * is the plural `listings` («3 объявления»); `{what}` and `{rate}` are the option's server strings, rendered as text
 * (SEC-REQ-021). Which outcome applies is `subscribe.ts`'s.
 */

/** What «Расширить» runs: `relax(radar.id, option.code)` of the flow, which shows its own outcome. */
export type RelaxRun = () => void | Promise<unknown>;

/** `{count}`: the starter count with its plural noun in the number locale (legacy `formatListingsCount`). */
const countOf = (starter: number, locale: Locale, t: Translate): string => formatCount(starter, "listings", locale, t);

/** `{hint}`: « — » and the first relaxed condition the server names, else nothing (the fix of LB-APP-005). */
const hintOf = (relaxed: readonly { text: string }[]): string => (relaxed[0] ? ` — ${relaxed[0].text}` : "");

/** A few toast: the text, then «Расширить» when the flow can widen (it knows the radar's id); else the text alone. */
function fewToast(text: string, t: Translate, run: RelaxRun | null): ToastMessage {
  return run === null ? text : { text, action: t("toast.relax"), run };
}

/** An identical radar is on: «Радар по этому поиску уже включён» (also `kind: existing` and `radar_duplicate`). */
export function alreadyOnToast(): ToastMessage {
  return { key: "toast.alreadyOn" };
}

/** The identical radar was off and is on again: «Радар снова включён» (also `kind: reactivated`). */
export function alertOnToast(): ToastMessage {
  return { key: "toast.alertOn" };
}

/** Created with finds: «Радар включён. {count} уже в чате с ботом». */
export function savedToast(starter: number, locale: Locale, t: Translate): ToastMessage {
  return { key: "toast.subSaved", values: { count: countOf(starter, locale, t) } };
}

/** Created, few listings: «Радар включён, но таких объявлений мало. {what}: {rate}» + «Расширить». */
export function savedFewToast(option: RadarOption, t: Translate, run: RelaxRun | null): ToastMessage {
  return fewToast(t("toast.subSavedFew", { what: option.label, rate: option.rate }), t, run);
}

/** Created, nothing yet: «Радар включён — новые придут в чат, как только появятся{hint}». */
export function savedEmptyToast(relaxed: readonly { text: string }[]): ToastMessage {
  return { key: "toast.subSavedEmpty", values: { hint: hintOf(relaxed) } };
}

/** Edited with finds, or widened with finds: «Радар обновлён. {count} под новые условия — в чате с ботом». */
export function updatedToast(starter: number, locale: Locale, t: Translate): ToastMessage {
  return { key: "toast.subUpdated", values: { count: countOf(starter, locale, t) } };
}

/** Edited, few listings: «Радар обновлён, но таких объявлений мало. {what}: {rate}» + «Расширить». */
export function updatedFewToast(option: RadarOption, t: Translate, run: RelaxRun | null): ToastMessage {
  return fewToast(t("toast.subUpdatedFew", { what: option.label, rate: option.rate }), t, run);
}

/** Edited, nothing yet: «Радар обновлён. Пока пусто{hint}». */
export function updatedEmptyToast(relaxed: readonly { text: string }[]): ToastMessage {
  return { key: "toast.subUpdatedEmpty", values: { hint: hintOf(relaxed) } };
}

/** Widened, nothing yet: «Радар расширен — новые придут в чат, как только появятся» (with finds: `updatedToast`). */
export function relaxedEmptyToast(): ToastMessage {
  return { key: "toast.relaxedEmpty" };
}

/** `no_chat` after the chat-access flow: «Радар не включён — боту нужно разрешение писать вам в чат». */
export function noChatToast(): ToastMessage {
  return { key: "toast.noChat" };
}

/** `radars_disabled` (`403`, DEC-51: the server switched radars off after the reference data was cached). */
export function soonToast(): ToastMessage {
  return { key: "radar.soon.title" };
}

/** `radar_limit`: «Уже {max} радаров — удалите ненужный во вкладке «Радар»»; `max` is the reference's limit. */
export function limitToast(max: number): ToastMessage {
  return { key: "toast.subLimit", values: { max } };
}

/** Any other failure: «Не получилось сохранить». */
export function saveFailedToast(): ToastMessage {
  return { key: "common.saveFailed" };
}
