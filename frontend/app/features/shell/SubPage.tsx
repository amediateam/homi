"use client";

import { SubPageFrame, type SubPageFrameProps } from "@homi/ui";

import { useBack } from "@/lib/navigation/useBack";
import { tg } from "@/lib/telegram";
import { useBottomMark } from "@/lib/ui/shellState";

export type SubPageProps = Omit<SubPageFrameProps, "onBack" | "swipeBack" | "onSwipeStart" | "onSwipeCommit">;

/**
 * A settings sub-page (WP-23, SCR-033 … SCR-039; WP-31 wraps each one): `SubPageFrame` of `@homi/ui` closed through
 * `back()` of `useBack()`. Telegram's BackButton calls it through `TelegramButtons`; the swipe back here calls it
 * once the page has slid out, after a light impact on the release that closes it (TMA-025). The swipe is touch only
 * and off on Android (`tg.isAndroid()`, the User-Agent check of TMA-041). The settings screen stays mounted below as
 * the layout, also on a direct load, whose Back goes to `/settings` (`parentOf`). Title, hint and `bare` pass through.
 * While it is mounted the app's toast sits 16 px above the bottom inset (`useBottomMark`, SCR-042).
 */
export function SubPage(props: SubPageProps) {
  const { back } = useBack();
  useBottomMark("subpage");

  return <SubPageFrame {...props} onBack={back} swipeBack={!tg.isAndroid()} onSwipeCommit={() => tg.haptic.impact()} />;
}
