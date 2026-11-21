"use client";

import { prefersReducedMotion } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useRef } from "react";

import { Field } from "./Field";
import { DESCRIPTION_MAX } from "./rules";

/** The ring's states (BR-APP-120): none while empty, `near` from 90 %, `full` at the limit. */
export function ringState(length: number): "none" | "ok" | "near" | "full" {
  if (length === 0) {
    return "none";
  }
  if (length >= DESCRIPTION_MAX) {
    return "full";
  }
  return length >= DESCRIPTION_MAX * 0.9 ? "near" : "ok";
}

const RADIUS = 9;
const CIRCLE = 2 * Math.PI * RADIUS;

/**
 * The description (SCR-052): at most 600 characters, `own.descriptionHint` with the count, and the limit ring of
 * legacy release `index-YX9bFVws.js` (`03` BR-APP-120): absent while empty, the share `n / 600` drawn as a ring,
 * the warning colour from 90 %, the error colour at 600; a keystroke that would pass 600 with a collapsed selection
 * shakes the ring for 0.32 s (±3 px; none under reduced motion).
 */
export function DescriptionSection({ value, onChange }: { value: string | null; onChange: (text: string | null) => void }) {
  const t = useTranslations();
  const ring = useRef<SVGSVGElement>(null);
  const text = value ?? "";
  const state = ringState(text.length);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (printable && field.value.length >= DESCRIPTION_MAX && field.selectionStart === field.selectionEnd && !prefersReducedMotion()) {
      ring.current?.animate?.(
        [{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
        { duration: 320 },
      );
    }
  };

  return (
    <Field label={t("own.description")} focus="description" hint={t("own.descriptionHint", { n: text.length, max: DESCRIPTION_MAX })}>
      <div className="relative">
        <textarea
          data-field="description"
          value={text}
          maxLength={DESCRIPTION_MAX}
          rows={5}
          placeholder={t("own.descriptionPh")}
          onKeyDown={onKeyDown}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value.slice(0, DESCRIPTION_MAX))}
          className="w-full resize-none rounded-medium border border-sep bg-fill px-3 py-2.5 pr-10 text-[16px] leading-[1.4] text-text outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-ring"
        />
        {state === "none" ? null : (
          <svg
            ref={ring}
            data-ring={state}
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-2.5 bottom-3 size-6 -rotate-90 text-accent data-[ring=full]:text-danger data-[ring=near]:text-warn"
          >
            <circle cx="12" cy="12" r={RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
            <circle
              cx="12"
              cy="12"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRCLE}
              strokeDashoffset={CIRCLE * (1 - Math.min(text.length, DESCRIPTION_MAX) / DESCRIPTION_MAX)}
            />
          </svg>
        )}
      </div>
    </Field>
  );
}
