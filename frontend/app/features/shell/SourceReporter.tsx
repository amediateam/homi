"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { type DataSource, reportSource } from "@/lib/data/sources";

/**
 * Rendered by a Server Component next to what it fetched, with that answer's `meta.source` (WP-20), so the demo
 * marker also sees answers that were read on the server.
 */
export function SourceReporter({ source }: { source: DataSource }) {
  const pathname = usePathname();
  useEffect(() => reportSource(source, pathname), [source, pathname]);
  return null;
}
