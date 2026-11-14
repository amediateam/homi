/** A Telegram user as it appears in `initData`; the fields of the Mini App launch payload. */
export interface SyntheticTelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface SyntheticInitDataOptions {
  /** `start_param` of a deep link (TMA-010). */
  startParam?: string;
  /** Unix seconds; defaults to the current (possibly frozen) clock. */
  authDate?: number;
}

/**
 * The `hash` of every synthetic `initData`: 64 zeros. It is obviously fake and does not verify against any bot
 * token, so a server that accepts it has a broken check (SEC-REQ-034).
 */
export const SYNTHETIC_HASH = "0".repeat(64);

/** An invented user: the id and names do not come from a real account. */
const syntheticUser: SyntheticTelegramUser = {
  id: 100_000_001,
  first_name: "Test",
  last_name: "User",
  username: "homi_synthetic_user",
  language_code: "ru",
  allows_write_to_pm: true,
};

/** Returns a Mini App `initData` query string with the usual fields and the fake hash; never a real user. */
export function syntheticInitData(user: Partial<SyntheticTelegramUser> = {}, options: SyntheticInitDataOptions = {}): string {
  const params = new URLSearchParams();
  params.set("query_id", "AAHomiSyntheticQuery");
  params.set("user", JSON.stringify({ ...syntheticUser, ...user }));
  params.set("auth_date", String(options.authDate ?? Math.floor(Date.now() / 1000)));
  if (options.startParam !== undefined) {
    params.set("start_param", options.startParam);
  }
  params.set("hash", SYNTHETIC_HASH);
  return params.toString();
}
