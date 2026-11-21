"use client";

import type { ReactNode } from "react";

import { OwnerFrame } from "../OwnerFrame";

/**
 * A step of the owner form over the questionnaire (the phone, the mode, the done step): a full-screen layer inside the
 * form's own (`--z-owner`), above the questionnaire and its footer bar, so Back finds the questionnaire as it was.
 */
export function StepFrame({ step, title, subtitle, footer, children }: { step: string; title: ReactNode; subtitle?: ReactNode; footer?: ReactNode; children?: ReactNode }) {
  return (
    <div data-owner-step={step} className="fixed inset-0 z-48 overflow-x-hidden overflow-y-auto overscroll-contain bg-bg text-text">
      <OwnerFrame title={title} subtitle={subtitle} footer={footer}>
        {children}
      </OwnerFrame>
    </div>
  );
}
