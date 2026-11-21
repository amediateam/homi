/**
 * The launch parameters of the Mini App (TMA-010 … TMA-012). `start_param` comes from the launch data, the rest from
 * the page query. Pure, memoised and never throws.
 */

export type LaunchEntry = "link" | "news" | "menu";
export type MapOverride = "gl" | "leaflet" | "auto";

export interface Launch {
  listingNumber: number | null;
  /** `web`, a campaign code (`fb12`, `tg3`), `seo`, `share` for any other `l_…`; `null` without a listing link. */
  source: string | null;
  /** `https://t.me/<channel>/<post>` named by an SEO or channel link, offered on the no-access screen. */
  postUrl: string | null;
  news: string | null;
  mapOverride: MapOverride | null;
  /** `?mapdebug` is present, with or without a value: the map view exposes its map object outside production. */
  mapDebug: boolean;
  entry: LaunchEntry;
  /**
   * An owner launch (WP-81, TMA-046, LB-APP-060): `new` for `start_param` `owner_new` or `owner-new` or the page query
   * `owner=new`; `phone` with the draft's id for `o_<ULID>` (the way back from the bot's share keyboard below 6.9). A
   * listing link wins over both; `entry` stays `menu` (the launch source of LB-APP-058 is reproduced, not fixed).
   */
  owner: { kind: "new" } | { kind: "phone"; id: string } | null;
  /**
   * `c_<number>` (WP-83): the listing opens first, as for `l_<number>`, then its request sheet «Отклик хозяину». The
   * bot's button that sends the link is WP-89's.
   */
  contact: boolean;
}

const OWNER_ID = /^o_([0-7][0-9A-HJKMNP-TV-Z]{25})$/i;

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
  // The whole campaign code (`fb12`), as legacy `getStartSource()` and the bot's attribution (BOT-031) read it.
  const campaign = /^-((?:fb|tg|ig)\d{1,4})$/.exec(rest);
  if (campaign) {
    return campaign[1];
  }
  return /^-seo(-|$)/.test(rest) ? "seo" : "share";
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
  const fromContact = positiveNumber(/^c_(\d+)$/.exec(startParam)?.[1]);
  const listingNumber = fromStart ?? fromContact ?? positiveNumber(query.get("listing"));
  const newsParam = query.get("news");
  const news = newsParam !== null && /^[a-z_]{1,32}$/.test(newsParam) ? newsParam : null;
  const mapParam = query.get("map");
  const mapOverride = mapParam === "gl" || mapParam === "leaflet" || mapParam === "auto" ? mapParam : null;
  const ownerPhone = OWNER_ID.exec(startParam)?.[1];
  const owner: Launch["owner"] =
    listingNumber !== null
      ? null
      : startParam === "owner_new" || startParam === "owner-new" || query.get("owner") === "new"
        ? { kind: "new" }
        : ownerPhone !== undefined
          ? { kind: "phone", id: ownerPhone }
          : null;
  return {
    listingNumber,
    source: fromStart !== null ? sourceOf(startParam) : null,
    postUrl: fromStart !== null ? postUrlOf(startParam) : null,
    news,
    mapOverride,
    mapDebug: query.has("mapdebug"),
    entry: listingNumber !== null ? "link" : news !== null ? "news" : "menu",
    owner,
    contact: fromStart === null && fromContact !== null,
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
