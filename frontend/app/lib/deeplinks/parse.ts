/**
 * The launch parameters of the Mini App (TMA-010 … TMA-012). `start_param` comes from the launch data, the rest from
 * the page query. Pure, memoised and never throws.
 */

export type LaunchEntry = "link" | "news" | "menu";
export type MapOverride = "gl" | "leaflet" | "auto";

export interface Launch {
  listingNumber: number | null;
  /** `web`, a campaign code `fb` / `tg` / `ig`, `seo`, `share` for any other `l_…`; `null` without a listing link. */
  source: string | null;
  /** `https://t.me/<channel>/<post>` named by an SEO or channel link, offered on the no-access screen. */
  postUrl: string | null;
  news: string | null;
  mapOverride: MapOverride | null;
  entry: LaunchEntry;
}

function positiveNumber(text: string | null | undefined): number | null {
  if (!text || !/^\d+$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function sourceOf(startParam: string): string | null {
  const rest = /^l_\d+(.*)$/.exec(startParam)?.[1];
  if (rest === undefined) {
    return null;
  }
  if (rest === "-web") {
    return "web";
  }
  const campaign = /^-(fb|tg|ig)\d{1,4}$/.exec(rest);
  if (campaign) {
    return campaign[1];
  }
  return rest.startsWith("-seo") ? "seo" : "share";
}

function postUrlOf(startParam: string): string | null {
  const match = /^l_\d+-(?:seo-)?([A-Za-z0-9_]{4,32})-(\d{1,12})$/.exec(startParam);
  return match ? `https://t.me/${match[1]}/${match[2]}` : null;
}

function read(initData: string, search: string): Launch {
  let startParam = "";
  let query = new URLSearchParams();
  try {
    startParam = new URLSearchParams(initData).get("start_param") ?? "";
  } catch {
    startParam = "";
  }
  try {
    query = new URLSearchParams(search);
  } catch {
    query = new URLSearchParams();
  }
  const fromStart = positiveNumber(/^l_(\d+)/.exec(startParam)?.[1]);
  const listingNumber = fromStart ?? positiveNumber(query.get("listing"));
  const newsParam = query.get("news");
  const news = newsParam !== null && /^[a-z_]{1,32}$/.test(newsParam) ? newsParam : null;
  const mapParam = query.get("map");
  const mapOverride = mapParam === "gl" || mapParam === "leaflet" || mapParam === "auto" ? mapParam : null;
  return {
    listingNumber,
    source: fromStart !== null ? sourceOf(startParam) : null,
    postUrl: fromStart !== null ? postUrlOf(startParam) : null,
    news,
    mapOverride,
    entry: listingNumber !== null ? "link" : news !== null ? "news" : "menu",
  };
}

let memo: { key: string; value: Launch } | null = null;

export function parseLaunch(initData: string, search: string): Launch {
  const key = `${initData}\n${search}`;
  if (memo === null || memo.key !== key) {
    memo = { key, value: read(initData, search) };
  }
  return memo.value;
}
