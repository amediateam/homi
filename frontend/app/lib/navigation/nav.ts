import { pushEntry, replaceTop, resetDepth, stack } from "./history";

/** The part of the next-intl router the app navigates with (`i18n/navigation.ts`). */
export interface BaseRouter {
  push(href: string, options?: { scroll?: boolean }): void;
  replace(href: string, options?: { scroll?: boolean }): void;
  back(): void;
}

/**
 * The app's navigation (`25` §3.2): thin wrappers over the next-intl router with `scroll: false` that keep the
 * history stack exact. The `useRouter` and `Link` of `i18n/navigation.ts` are built on the same functions, so a
 * `router.push` anywhere counts. `tab` is for the tab bar and the list/map switch: it replaces the address and clears
 * the stack.
 */
export function navWith(router: () => BaseRouter | null) {
  return {
    push(href: string): void {
      stack();
      router()?.push(href, { scroll: false });
      pushEntry(href);
    },
    replace(href: string): void {
      stack();
      router()?.replace(href, { scroll: false });
      replaceTop(href);
    },
    back(): void {
      stack();
      router()?.back();
    },
    tab(href: string): void {
      stack();
      router()?.replace(href, { scroll: false });
      resetDepth(href);
    },
  };
}

let bound: BaseRouter | null = null;

/** `NavigationBinder` hands the router of the root layout to `nav`, so code outside components can navigate. */
export function bindRouter(router: BaseRouter): void {
  bound = router;
}

export const nav = navWith(() => bound);
