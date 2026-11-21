import { cn } from "../cn";

const STRIP = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The delay between two neighbouring digits (ms): the rightmost starts first. */
export const ROLL_STAGGER_MS = 45;

/**
 * A number whose digits roll to a new value like a split-flap board (WP-39, BR-APP-113; legacy `RollNumber.jsx`
 * since `index-YX9bFVws.js`). One column per digit of `max(0, round(value))`: a hidden digit gives the column its
 * width, and over it a strip of 0 – 9 is shifted to the digit by `translateY`; the shift is a CSS transition
 * (`.roll-strip` of motion.css: 0.62 s on the release's spring), the rightmost digit first, `ROLL_STAGGER_MS` apart.
 * The columns are keyed from the end, so when the length changes the units stay the units. The plain number is the
 * label and the columns are hidden from assistive technology. Under reduced motion the strip jumps (motion.css).
 */
export function RollNumber({ value, className }: { value: number; className?: string }) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span data-slot="roll-number" aria-label={digits.join("")} className={cn("tabular-nums", className)}>
      {digits.map((digit, index) => (
        <span key={digits.length - index} aria-hidden className="relative inline-block leading-[1.25]">
          <span className="invisible">{digit}</span>
          <span className="absolute inset-0 overflow-hidden">
            <span
              data-roll-strip=""
              className="roll-strip absolute inset-x-0 top-0 h-[1000%]"
              style={{
                transform: `translateY(${-Number(digit) * 10}%)`,
                transitionDelay: `${(digits.length - 1 - index) * ROLL_STAGGER_MS}ms`,
              }}
            >
              {STRIP.map((one) => (
                <span key={one} className="block h-[10%] text-center">
                  {one}
                </span>
              ))}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
