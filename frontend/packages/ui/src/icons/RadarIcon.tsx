import { createLucideIcon } from "lucide-react";

/**
 * The radar of the tab bar (legacy custom icon in the lucide style, D-UI-1): two rings and a beam. Made with
 * `createLucideIcon`, so it is a `LucideIcon` like Search, Heart and Settings beside it: stroke `currentColor`, the
 * `size` and `strokeWidth` props, `aria-hidden` unless it is given a label.
 */
export const RadarIcon = createLucideIcon("radar-icon", [
  ["circle", { cx: "12", cy: "12", r: "9", key: "ring" }],
  ["circle", { cx: "12", cy: "12", r: "4.5", key: "inner-ring" }],
  ["path", { d: "M12 12l6.4-6.4", key: "beam" }],
]);
