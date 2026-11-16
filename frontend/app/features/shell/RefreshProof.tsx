"use client";

import { useEffect, useState } from "react";

import { routes } from "@/lib/navigation/routes";
import { registerRefresh } from "@/lib/ui/shellState";

/** How long the stand-in refresh takes: less than the spinner's 700 ms minimum, which then holds it. */
const REFRESH_MS = 300;

/**
 * A stand-in refresh handler of the feed placeholder (WP-23), for `e2e/shell.spec.ts`: a pull on the feed counts here
 * (`data-refresh-count`) once its promise resolves. WP-24 replaces it with the feed's own handler, which re-creates
 * the list.
 */
export function RefreshProof() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unregister = registerRefresh(
      routes.feed(),
      () =>
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            setCount((value) => value + 1);
            resolve();
          }, REFRESH_MS);
        }),
    );
    return () => {
      unregister();
      clearTimeout(timer);
    };
  }, []);

  return (
    <output data-proof="refresh" data-refresh-count={count} className="text-[13px]">
      {count}
    </output>
  );
}
