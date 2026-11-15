import { brand } from "@/lib/brand";

/**
 * The only place a Telegram link is built (TMA-013). A builder answers `null` when a part is missing or invalid, and
 * the caller hides its button.
 */

const USERNAME = /^[A-Za-z0-9_]{4,32}$/;
const PAYLOAD = /^[A-Za-z0-9_-]{1,64}$/;

const isUsername = (value: string): boolean => USERNAME.test(value);
const isPositive = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

function bot(): string | null {
  return isUsername(brand.botUsername) ? `https://t.me/${brand.botUsername}` : null;
}

export function botUrl(): string | null {
  return bot();
}

/** `?start=<payload>`; without a payload the bare `?start` (the bot's start button). */
export function botStartUrl(payload?: string): string | null {
  const base = bot();
  if (base === null) {
    return null;
  }
  if (payload === undefined) {
    return `${base}?start`;
  }
  return PAYLOAD.test(payload) ? `${base}?start=${payload}` : null;
}

/** The listing inside the Mini App: `?startapp=l_<number>` (the share fallback text). */
export function botStartAppUrl(number: number): string | null {
  const base = bot();
  return base !== null && isPositive(number) ? `${base}?startapp=l_${number}` : null;
}

/** «Перейти в бота» of the no-access screen: `?start=s_<source>[--l<number>]`. */
export function noAccessStartUrl(source: string, number?: number): string | null {
  if (number !== undefined && !isPositive(number)) {
    return null;
  }
  return botStartUrl(`s_${source}${number !== undefined ? `--l${number}` : ""}`);
}

export function supportUrl(username: string, number?: number): string | null {
  if (!isUsername(username) || (number !== undefined && !isPositive(number))) {
    return null;
  }
  return `https://t.me/${username}${number !== undefined ? `?start=l_${number}` : ""}`;
}

export function channelPostUrl(channel: string, post: number): string | null {
  return isUsername(channel) && isPositive(post) && post < 1e12 ? `https://t.me/${channel}/${post}` : null;
}
