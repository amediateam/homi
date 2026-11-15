import { attempt, webApp } from "./sdk";

type ImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";

/** Haptic feedback (TMA-025): optional calls without a gate; `selectionChanged` is not used. */
export const haptic = {
  impact(style: ImpactStyle = "light"): void {
    attempt(() => webApp()?.HapticFeedback?.impactOccurred?.(style));
  },
  success(): void {
    attempt(() => webApp()?.HapticFeedback?.notificationOccurred?.("success"));
  },
  error(): void {
    attempt(() => webApp()?.HapticFeedback?.notificationOccurred?.("error"));
  },
};
