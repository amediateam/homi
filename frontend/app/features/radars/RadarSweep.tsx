import { cn } from "@homi/ui";
import type { CSSProperties } from "react";

/** A blip of the art: its centre in per cent of the art (left, top) and its delay in the 3.2 s cycle, in seconds. */
interface Blip {
  left: number;
  top: number;
  delay: number;
}

/**
 * The legacy blips: three on the radar tab's empty state (SCR-027), two on the radar card in the feed (SCR-047), the
 * second 1.9 s and the third 1.2 s behind the first (legacy `nth-of-type` delays).
 */
const BLIPS: Readonly<Record<2 | 3, readonly Blip[]>> = {
  3: [
    { left: 64, top: 26, delay: 0 },
    { left: 28, top: 62, delay: 1.9 },
    { left: 70, top: 70, delay: 1.2 },
  ],
  2: [
    { left: 66, top: 28, delay: 0 },
    { left: 30, top: 64, delay: 1.9 },
  ],
};

/** Art up to this size is the feed card's (56 px): 7 px blips with a 3 px halo; larger art (132 px) has 9 px and 4 px. */
const SMALL_ART_PX = 64;

/** Three 1 px rings of `--sep` over the fill, at 21 %, 43 % and 66 % of the gradient (legacy `.radar-art`). */
const RINGS = `radial-gradient(circle, ${[21, 43, 66]
  .map((at) => `transparent ${at}%, var(--sep) ${at}%, var(--sep) calc(${at}% + 1px), transparent calc(${at}% + 1px)`)
  .join(", ")})`;

/** The wedge: the accent at 55 % fading out over the first 22 % of the turn (legacy `.radar-sweep`). */
const SWEEP = "conic-gradient(from 0deg, color-mix(in srgb, var(--accent) 55%, transparent), transparent 22%)";

export interface RadarSweepProps {
  /** The diameter in px: 132 on the radar tab's empty state, 56 on the radar card in the feed. */
  size: number;
  /** Three blips on the tab, two on the feed card. */
  blips: 2 | 3;
  className?: string;
}

/**
 * The radar art (WP-30; legacy `.radar-art`, SCR-027 and SCR-047): a circle with three rings, a turning accent wedge
 * and blips that flash and fade on the 3.2 s cycle of `animate-radar-turn` / `animate-radar-blip` (@homi/ui). Every
 * animated element carries `data-radar-animation`, so lite graphics (`html.lite`) and reduced motion stop them all;
 * the static picture is then the wedge at 0° with the blips at full opacity. Decorative: hidden from screen readers,
 * no hooks, so it renders on the server as on the client.
 */
export function RadarSweep({ size, blips, className }: RadarSweepProps) {
  const small = size <= SMALL_ART_PX;
  const dot = small ? 7 : 9;
  const halo = small ? 3 : 4;

  return (
    <div
      aria-hidden
      data-slot="radar-sweep"
      className={cn("relative shrink-0 overflow-hidden rounded-pill bg-fill shadow-[inset_0_0_0_1px_var(--sep)]", className)}
      style={{ width: size, height: size, backgroundImage: RINGS }}
    >
      <span
        data-radar-animation=""
        data-slot="radar-sweep-wedge"
        className="absolute inset-0 animate-radar-turn rounded-pill"
        style={{ backgroundImage: SWEEP }}
      />
      {BLIPS[blips].map((blip) => {
        const style: CSSProperties = {
          left: `${blip.left}%`,
          top: `${blip.top}%`,
          width: dot,
          height: dot,
          margin: `${-dot / 2}px 0 0 ${-dot / 2}px`,
          boxShadow: `0 0 0 ${halo}px color-mix(in srgb, var(--accent) 25%, transparent)`,
          animationDelay: `${blip.delay}s`,
        };
        return (
          <span
            key={`${blip.left}-${blip.top}`}
            data-radar-animation=""
            data-slot="radar-sweep-blip"
            className="absolute animate-radar-blip rounded-pill bg-accent"
            style={style}
          />
        );
      })}
    </div>
  );
}
