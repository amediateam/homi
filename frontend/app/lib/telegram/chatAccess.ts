import { track } from "@/lib/analytics/events";
import type { ApiResult } from "@/lib/api/types";
import { botUrl } from "@/lib/deeplinks/build";

import { tg } from "./index";

/**
 * The "bot cannot write to you" case of the radar writes (WP-30, TMA-033, legacy `lib/chatAccess.js`): the server
 * answers `409 no_chat` when HOMI's bot may not message the user, and the app asks Telegram for write access to it.
 * Turning a radar on, creating, replacing and widening go through `withChatAccess`; pausing, the mode, unhide and
 * delete do not (BR-APP-048).
 */

export interface ChatAccessOptions {
  /** `t("chat.restart")`: the question that offers to open the bot when Telegram cannot ask. */
  restartText: string;
}

/** The failure of a radar write whose cause is the missing chat with the bot (`409`, code `no_chat`, WP-13). */
export function isNoChat(result: ApiResult<unknown>): boolean {
  return !result.ok && result.error === "conflict" && result.code === "no_chat";
}

/** The native sheet that is open now; a second caller waits for the same answer instead of opening another. */
let asking: Promise<boolean | null> | null = null;
/** The restart question that is open now, shared the same way. */
let offering: Promise<void> | null = null;

/** Asks once for all concurrent callers and logs the user's answer once; `null` when the client cannot ask (below 6.9, outside Telegram). */
function askWriteAccess(): Promise<boolean | null> {
  asking ??= tg
    .requestWriteAccess()
    .then((granted) => {
      if (granted === true) {
        track("chat_access_allowed");
      } else if (granted === false) {
        track("chat_access_declined");
      }
      return granted;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** The fallback of a client that cannot ask: when HOMI's bot is configured, offer to open it (its start grants the chat). */
function offerRestart(text: string): Promise<void> {
  const url = botUrl();
  if (url === null) {
    return Promise.resolve();
  }
  offering ??= tg
    .confirm(text)
    .then((confirmed) => {
      if (confirmed) {
        tg.openLink(url);
      }
    })
    .finally(() => {
      offering = null;
    });
  return offering;
}

/**
 * Runs a radar write and, when it fails with `no_chat`, the chat-access flow (WP-30 "Chat access"):
 *
 * 1. Ask Telegram for write access (`tg.requestWriteAccess()`, `null` below 6.9 and outside Telegram).
 * 2. Declined → `chat_access_declined`, the failure is returned, no question follows.
 * 3. Granted → `chat_access_allowed`, the write runs once more; its success or its other failure is returned (legacy
 *    rethrew the retry's error), another `no_chat` falls through.
 * 4. Cannot ask, or still `no_chat`: when `botUrl()` exists, `tg.confirm(restartText)` and on OK the bot opens. The
 *    original failure is returned.
 * 5. A call while the native sheet or the question is open shares it: one sheet, one answer, one event.
 *
 * Any other result of the first run is returned untouched.
 */
export async function withChatAccess<T>(run: () => Promise<ApiResult<T>>, { restartText }: ChatAccessOptions): Promise<ApiResult<T>> {
  const first = await run();
  if (!isNoChat(first)) {
    return first;
  }
  const granted = await askWriteAccess();
  if (granted === false) {
    return first;
  }
  if (granted === true) {
    const second = await run();
    if (!isNoChat(second)) {
      return second;
    }
  }
  await offerRestart(restartText);
  return first;
}
