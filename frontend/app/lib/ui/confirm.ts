import { tg } from "@/lib/telegram";

/**
 * A yes/no question before a destructive step (SCR-043): Telegram's native dialog from 6.2, the browser's otherwise
 * — the version gate is `tg.confirm`'s (WP-21). Texts come from the caller: `feed.clearConfirm` (WP-29),
 * `subs.deleteConfirm` and `chat.restart` (WP-30), `hidden.confirmAll` (WP-31).
 */
export function confirmText(text: string): Promise<boolean> {
  return tg.confirm(text);
}
