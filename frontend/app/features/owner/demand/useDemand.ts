"use client";

import { useEffect, useState } from "react";

import { useRadarsEnabled } from "@/features/radars/capability";
import { bffFetch } from "@/lib/api/browser";

import type { OwnerForm } from "../normalize";

/** The read waits this long after a change (BR-APP-083). */
export const DEMAND_WAIT_MS = 500;

export type Demand = { count: number | null; few: boolean; usualLowUsd: number | null; usualHighUsd: number | null };

type Answer = { count?: number | null; few?: boolean; usual_low_usd?: number | null; usual_high_usd?: number | null };

/** The query of the demand read: never without a city; the price only with its currency. */
export function demandQuery(form: Pick<OwnerForm, "city" | "district_code" | "rooms" | "room" | "price" | "currency">): Record<string, string | number> | null {
  if (form.city === null) {
    return null;
  }
  return {
    city: form.city,
    ...(form.district_code === null ? {} : { district: form.district_code }),
    ...(form.room ? { room: 1 } : form.rooms === null ? {} : { rooms: form.rooms }),
    ...(form.price === null ? {} : { price: form.price, currency: form.currency }),
  };
}

/**
 * `GET /owner/demand` (WP-81, BR-APP-083, DEC-78, DEC-84): 500 ms after a change of city, district, rooms, room, price
 * or currency, the previous read aborted, never without a city; errors are silent (`null`). While radars are off
 * (DEC-51) the count and `few` are dropped, so no demand line shows; the usual price still does.
 */
export function useDemand(form: OwnerForm): Demand | null {
  const radars = useRadarsEnabled();
  const query = demandQuery(form);
  const key = query === null ? null : JSON.stringify(query);
  const [answer, setAnswer] = useState<{ for: string; demand: Demand | null } | null>(null);

  useEffect(() => {
    if (key === null) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void bffFetch<Answer>("owner/demand", { query: JSON.parse(key) as Record<string, string | number>, signal: controller.signal }).then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setAnswer({
          for: key,
          demand: result.ok
            ? {
                count: typeof result.data.count === "number" ? result.data.count : null,
                few: result.data.few === true,
                usualLowUsd: typeof result.data.usual_low_usd === "number" ? result.data.usual_low_usd : null,
                usualHighUsd: typeof result.data.usual_high_usd === "number" ? result.data.usual_high_usd : null,
              }
            : null,
        });
      }, () => {
        // `bffFetch` rejects only for the abort of its caller, which is dropped: left unhandled it surfaced as an
        // uncaught page error, which the e2e checks fail on (WP-33). Anything else is a bug, silent like an error: `null`.
        if (!controller.signal.aborted) {
          setAnswer({ for: key, demand: null });
        }
      });
    }, DEMAND_WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  if (key === null || answer === null || answer.for !== key) {
    return null;
  }
  return answer.demand === null ? null : { ...answer.demand, ...(radars ? {} : { count: null, few: false }) };
}

/** The demand line (DEC-84, DEV-063): the number from 5, «несколько человек» for `few`, none for 0 or radars off. */
export function demandLine(demand: Demand | null): { kind: "count"; n: number } | { kind: "few" } | null {
  if (demand === null) {
    return null;
  }
  if (demand.count !== null && demand.count > 0) {
    return { kind: "count", n: demand.count };
  }
  return demand.few ? { kind: "few" } : null;
}
