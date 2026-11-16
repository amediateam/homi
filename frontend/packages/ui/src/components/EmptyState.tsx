import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";

/** The centred column shared by the empty and the error state (legacy `empty`, `empty tall` for a whole screen). */
export const stateLayout = cva("flex flex-col items-center px-6 py-16 text-center text-hint", {
  variants: {
    tall: { true: "gap-2.5 pt-24", false: "gap-1.5" },
  },
  defaultVariants: { tall: false },
});

export type EmptyStateProps = Omit<ComponentProps<"div">, "title" | "children"> & {
  /** The address of the mascot. Without one the 120 px box stays, empty, so the layout does not jump. */
  image?: string;
  title: ReactNode;
  hint?: ReactNode;
  /** A button under the hint, for example «Сбросить фильтры». */
  action?: ReactNode;
  /** The taller variant for a whole screen. */
  tall?: boolean;
  /** The title's element: `h1` when the state is the whole screen (the crash and not-found screens), else `p`. */
  titleAs?: "p" | "h1" | "h2";
};

/**
 * An empty list or screen (WP-23, legacy `empty` with a 120 px mascot): image, title, hint and an optional action.
 * The image is decorative (`alt=""`); the texts and the image address come from the caller.
 */
export function EmptyState({ image, title, hint, action, tall = false, titleAs: Title = "p", className, ...props }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn(stateLayout({ tall }), className)} {...props}>
      <div data-slot="empty-state-media" className="mb-1.5 size-[120px] shrink-0">
        {image ? (
          <img
            data-slot="empty-state-image"
            src={image}
            alt=""
            draggable={false}
            className="size-full object-contain"
          />
        ) : null}
      </div>
      <Title data-slot="empty-state-title" className="text-[17px] font-bold text-text">
        {title}
      </Title>
      {hint ? (
        <p data-slot="empty-state-hint" className={cn(tall && "max-w-[300px]")}>
          {hint}
        </p>
      ) : null}
      {action ? (
        <div data-slot="empty-state-action" className="mt-2.5">
          {action}
        </div>
      ) : null}
    </div>
  );
}
