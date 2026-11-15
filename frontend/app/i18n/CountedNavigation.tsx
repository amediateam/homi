"use client";

import { createNavigation } from "next-intl/navigation";
import { type ComponentProps, type MouseEvent, useMemo } from "react";

import { pushEntry, replaceTop, stack } from "@/lib/navigation/history";

import { routing } from "./routing";

const base = createNavigation(routing);

type BaseRouter = ReturnType<typeof base.useRouter>;
type Href = Parameters<BaseRouter["push"]>[0];
type Options = Parameters<BaseRouter["push"]>[1];

/** `string` or `{ pathname, query }` as the app's history stack spells it. */
function addressOf(href: Href | ComponentProps<typeof base.Link>["href"]): string {
  if (typeof href === "string") {
    return href;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries((href as { query?: Record<string, unknown> }).query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) {
        query.append(key, String(item));
      }
    }
  }
  const search = query.toString();
  return `${(href as { pathname: string }).pathname}${search ? `?${search}` : ""}`;
}

/**
 * The next-intl router with every `push`, `replace` and `back` counted in the app's history stack (WP-21), so that
 * BackButton knows the depth. Feature code takes routers and links from `@/i18n/navigation` only.
 */
export function useRouter(): BaseRouter {
  const router = base.useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href: Href, options?: Options) => {
        stack();
        router.push(href, { scroll: false, ...options });
        pushEntry(addressOf(href));
      },
      replace: (href: Href, options?: Options) => {
        stack();
        router.replace(href, { scroll: false, ...options });
        replaceTop(addressOf(href));
      },
      back: () => {
        stack();
        router.back();
      },
    }),
    [router],
  );
}

/** The plain next-intl router, for `NavigationBinder` only: `nav` counts its steps itself. */
export const useUncountedRouter = base.useRouter;

function plainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** next-intl's `Link` whose unmodified click appends its target to the stack, or rewrites the top for `replace`. */
export function Link({ onClick, replace, scroll = false, target, ...props }: ComponentProps<typeof base.Link>) {
  return (
    <base.Link
      {...props}
      replace={replace}
      scroll={scroll}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (!plainClick(event) || (target !== undefined && target !== "_self")) {
          return;
        }
        stack();
        if (replace) {
          replaceTop(addressOf(props.href));
        } else {
          pushEntry(addressOf(props.href));
        }
      }}
    />
  );
}
