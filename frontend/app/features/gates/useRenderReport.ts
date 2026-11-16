import { useEffect } from "react";

import { reportError } from "@/lib/errors/report";

/** The thrown objects already reported, whichever boundary showed them. */
const reported = new WeakSet<object>();

/**
 * Reports the error a render boundary caught (SCR-045, D-E-1): `reportError(error, { kind: "render" })` once the
 * screen has committed, once per thrown object — re-renders, a hidden route shown again (its effects re-run under
 * `cacheComponents`) and a second boundary seeing the same object report nothing more. A thrown value that is not an
 * object cannot be remembered and is reported again only when the value changes or the screen mounts anew.
 */
export function useRenderReport(error: unknown): void {
  useEffect(() => {
    if (typeof error === "object" && error !== null) {
      if (reported.has(error)) {
        return;
      }
      reported.add(error);
    }
    reportError(error, { kind: "render" });
  }, [error]);
}
