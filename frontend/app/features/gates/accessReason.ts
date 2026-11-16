import { noAccessStartUrl, supportUrl } from "@/lib/deeplinks/build";
import type { Launch } from "@/lib/deeplinks/parse";
import { accessReason, type AccessReason } from "@/lib/session/types";

/**
 * What the no-access screen offers (WP-23, SCR-003, D-S-4). The reason whitelist is the session's (`accessReason()`
 * of `lib/session/types.ts`) and the links are WP-21's: the post address its launch parser built and the builders of
 * `lib/deeplinks/build.ts`, so nothing is parsed or spelled here. Pure.
 */

/** One large button of the screen, in the legacy order; the screen picks its label and haptic by `action`. */
export type NoAccessRow =
  | { action: "post"; url: string }
  | { action: "toBot"; url: string }
  | { action: "back" }
  | { action: "support"; url: string };

export interface NoAccessInput {
  /** The session's refusal; anything but the five reasons reads as `private`. */
  reason: unknown;
  /** An automatic re-check is scheduled or running (`useBootRetryState().checking`). */
  checking: boolean;
  /** `parseLaunch(tg.initData(), location.search)`. */
  launch: Pick<Launch, "source" | "listingNumber" | "postUrl">;
  /** The support account of the reference data; `null` while it is unknown. */
  supportUsername: string | null;
}

export interface NoAccessView {
  reason: AccessReason;
  /** The checking line: while a re-check is pending, never for `blocked`. */
  checking: boolean;
  rows: NoAccessRow[];
}

/**
 * The main button: «Перейти в бота» with `?start=s_<source>[--l<number>]` when the launch is a listing link (an `l_…`
 * start parameter: the parser sets `source` for no other), the bot is known (`brand.botUsername`, which
 * `noAccessStartUrl` reads) and the reason is not `blocked`; otherwise «Вернуться в бот», which closes the app.
 */
export function mainRow(reason: AccessReason, launch: NoAccessInput["launch"]): NoAccessRow {
  const url = reason !== "blocked" && launch.source !== null ? noAccessStartUrl(launch.source, launch.listingNumber ?? undefined) : null;
  return url === null ? { action: "back" } : { action: "toBot", url };
}

/**
 * The screen of one refusal: «📢 Открыть пост в канале» only when the start parameter named a channel and a post
 * (`l_<id>-[seo-]<channel>-<post>`, TMA-011), the main button, then «Написать в поддержку» only when the reference
 * data knows a support account — while it does not the row is absent, and nothing waits for it.
 */
export function noAccessView({ reason, checking, launch, supportUsername }: NoAccessInput): NoAccessView {
  const kind = accessReason(reason);
  const rows: NoAccessRow[] = [];
  if (launch.postUrl !== null) {
    rows.push({ action: "post", url: launch.postUrl });
  }
  rows.push(mainRow(kind, launch));
  const support = supportUsername === null ? null : supportUrl(supportUsername);
  if (support !== null) {
    rows.push({ action: "support", url: support });
  }
  return { reason: kind, checking: checking && kind !== "blocked", rows };
}
