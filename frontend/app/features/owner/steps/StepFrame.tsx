"use client";

import type { ReactNode } from "react";

import { FallbackClose } from "@/features/shell/FallbackClose";

import { OwnerFrame } from "../OwnerFrame";

/**
 * A step of the owner form over the questionnaire (the phone, the mode, the done step): a full-screen layer inside the
 * form's own (`--z-owner`), above the questionnaire and its footer bar, so Back finds the questionnaire as it was.
 */
export function StepFrame({
  step,
  title,
  subtitle,
  footer,
  children,
  onClose,
}: {
  step: string;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** The fallback cross while the Telegram SDK is absent (TMA-047): the step's own Back. */
  onClose: () => void;
}) {
  return (
    <div data-owner-step={step} className="fixed inset-0 z-48 overflow-x-hidden overflow-y-auto overscroll-contain bg-bg text-text">
      <OwnerFrame title={title} subtitle={subtitle} footer={footer}>
        {children}
      </OwnerFrame>
      <FallbackClose onClose={onClose} />
    </div>
  );
}
