import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** The radius names of theme.css, so `rounded-small` and `rounded-pill` replace each other like built-in sizes. */
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ["small", "medium", "large", "photo", "pill"] } },
});

export type { ClassValue };

/** Joins conditional class names and lets a later Tailwind class win over an earlier one of the same group. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
