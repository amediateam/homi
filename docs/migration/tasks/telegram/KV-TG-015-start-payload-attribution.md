# KV-TG-015 — `/start` payload parser and attribution

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-ONBOARD-005, F-LANDING-005, F-SEO-010 |
| Dependencies | KV-TG-014; `user_attributions` of the identity schema (KV-DB-007, `14` §8); DEV-049, DEV-040 (`PROPOSED`); Q-BOT-032; invite admission of the access gate (F-ACCESS-002) for invite links (Q-API-006) |

## Goal

Every `/start` payload that the landing, the SEO pages and the Mini App build is parsed by one strict parser, the arrival
source (tag, SEO slice, visit id, referral, listing) is stored per user, and the user always gets the ordinary welcome —
malformed or unknown payloads included.

## Legacy reference

- Payload table `04` §6.1: BOT-027 `s_web`, BOT-028 `s_web_<tag>`, BOT-029 `--v<visit>`, BOT-030 `s_seo[_<lang>][_<slice>]`,
  BOT-031 `s_<source>--l<id>` (hand-off message in KV-TG-016), BOT-032 `s_friend`, BOT-033 `l_<id>`, BOT-034 unknown.
- Grammar CONFIRMED in client code: `$KVADRO_ROOT/demo/landing/site/landing.js:30-42`,
  `$KVADRO_ROOT/demo/landing/site/stats.js:18-20`, `$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:26-27`,
  `:66`, `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:32-42`, `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:119`;
  SEO slices `$KVADRO_ROOT/docs/seo-pages.md` §9.
- Rules: BR-BOT-096 (tag `[a-z0-9_-]{1,40}`, visit `--v` + `[a-z0-9]{10}`, the part before the visit cut to 49 chars,
  listing suffix `--l<id>`), BR-BOT-098 (source and visit id stored per user), BR-BOT-085. Lengths up to 62 characters
  (Telegram limit 64, `04` §6.1 note). Edge: `s_share` without `--l<id>` (`04` §6.1).
- Public URLs: URL-045, URL-046, URL-047, URL-048, URL-049; entity ENT-005.

## Implementation

1. Tests first (`php artisan make:test --pest --unit Telegram/StartPayloadParserTest`, `Bot/StartAttributionTest`).
2. `php artisan make:class Telegram/DeepLinks/StartPayloadParser` → readonly `StartPayload {kind, source, tag, seoLang,
   seoSlice, visitId, listingNumber, raw}`; kinds `Web`, `Seo`, `Friend`, `Source` (any other `s_<source>`, e.g. `fb12`,
   `tg3`, `ig5`, `share`), `ListingLegacy` (`l_<digits>`), `Invite` (only HOMI-issued invite tokens, see step 5),
   `Unknown`. Order: reject > 64 bytes or characters outside `[A-Za-z0-9_-]` → `Unknown`; strip a trailing
   `--v[a-z0-9]{10}`; strip `--l<digits>`; then match the prefix. Tags are lower-cased.
3. SEO payloads: accept every legacy form (`s_seo`, `s_seo_uz`, `s_seo_tashkent_yunusobod_2k`,
   `s_seo_uz_kv_yunusobod-minor`, …); with DEV-049 approved, also parse the formal grammar
   (`s_seo_<lang|ru>_<section>_<city>[_<district>|_kv_<quarter>|_m_<station>][_<N>k][_owners]`) into named parts; the raw
   value is stored either way.
4. Attribution: insert one `user_attributions` row per `/start` with a payload (`raw_payload`, `source`, `tag`,
   `seo_lang`, `seo_slice`, `visit_id`, `listing_id` by public number, `touched_at`); first touch = earliest row, last
   touch = latest (`06` §4.2 row ENT-005; which one analytics uses is Q-BOT-032 / M7). `/start` without payload writes
   nothing. The PostHog join of the visit id belongs to analytics (F-ANALYTICS-002), not to this task.
5. Invite payloads: the legacy invite link format is unknown (Q-API-006). The parser reserves `inv_<token>` for invites
   issued by HOMI's access administration and passes the token to the access gate's invite admission (F-ACCESS-002);
   legacy invites are not decoded (recorded as a gap in the PR if Q-API-006 shows they are still in circulation).
6. After parsing, `StartCommand` (KV-TG-014) sends the welcome; `Source` with a listing and `ListingLegacy` continue in
   KV-TG-016.
7. DEV-040: `s_web_qr` is an ordinary tag (`qr`), no code needed beyond the tag rules; the parser test includes it.

## Files

- `backend/app/Telegram/DeepLinks/{StartPayloadParser,StartPayload}.php`, `backend/app/Enums/Telegram/StartPayloadKind.php` (new)
- `backend/app/Services/Telegram/AttributionRecorder.php` (new)
- `backend/app/Telegram/Handlers/StartCommand.php` (calls parser and recorder)
- `backend/tests/Unit/Telegram/StartPayloadParserTest.php`, `backend/tests/Feature/Bot/StartAttributionTest.php` (new)

## API contract

Inbound `message.text = "/start <payload>"` (Telegram passes `start` parameters ≤ 64 characters from
`[A-Za-z0-9_-]`). No outbound call besides the welcome of KV-TG-014.

## Business rules

- Kept: BR-BOT-085, BR-BOT-096, BR-BOT-098; BR-API-015 (gated users arrive with `s_<source>--l<id>`).
- DEV-049 (`PROPOSED`, formal `s_seo` grammar, legacy forms still accepted) and DEV-040 (`PROPOSED`, QR tag) — neither
  changes what existing links do.
- Every payload yields the ordinary welcome (BOT-027 … BOT-034); spec-tested where legacy handling is `UNVERIFIED`
  (Q-BOT-032).

## Acceptance criteria

- Every payload of the table below parses as stated, and the stored row matches.
- Malformed payloads never fail `/start`; they are stored as `Unknown` with the raw value only when it is ≤ 64
  characters of the allowed alphabet, otherwise nothing is stored.
- A user with three `/start`s with payloads has three rows; first and last touch are derivable.

## Tests

| # | `/start` payload | Parsed / stored |
| - | ---------------- | --------------- |
| 1 | `s_web` | `Web`, tag null |
| 2 | `s_web_insta_1` | `Web`, tag `insta_1` |
| 3 | `s_web_Insta--vabc123def4` | `Web`, tag `insta`, visit `abc123def4` |
| 4 | `s_seo_tashkent_yunusobod_2k` | `Seo`, lang `ru`, slice `tashkent_yunusobod_2k` |
| 5 | `s_seo_uz_kv_yunusobod-minor--v0123456789` | `Seo`, lang `uz`, slice `kv_yunusobod-minor`, visit set |
| 6 | `s_friend` | `Friend` |
| 7 | `s_web--l51358` | `Source` `web`, listing 51358 (hand-off in KV-TG-016) |
| 8 | `s_fb12--l51358` | `Source` `fb12`, listing 51358 |
| 9 | `s_share` | `Source` `share`, no listing |
| 10 | `l_51358` | `ListingLegacy` 51358 |
| 11 | `l_abc` | `Unknown` |
| 12 | 70 characters of `a` | `Unknown`, nothing stored; welcome sent |
| 13 | `s_web_qr` | `Web`, tag `qr` (DEV-040) |
| 14 | `conversation(user: 'A')->send('/start s_seo_en_tashkent')` | welcome in the user's locale; one attribution row |

## Edge cases

- Tag with characters outside the alphabet (Telegram rejects them before the bot, but forged updates may carry them):
  `Unknown`.
- `--v` appearing twice: only the trailing well-formed suffix counts.
- Listing numbers above the legacy maximum are valid (new HOMI listings, CF-003).

## Security

- SEC-REQ-022 (telemetry and attribution input bounded and allow-listed), SEC-REQ-036 (no names; the payload is not
  personal data but is tied to the user and is in the erasure scope, SEC-REQ-039).
- Invite tokens compared by hash in the access gate; never logged.

## Definition of done

Tests green (`make ci-backend`), the payload table added to KV-QA-014's deep-link suite, F-ONBOARD-005 / F-LANDING-005 /
F-SEO-010 parity-gate rows updated, PR reviewed by the other developer.
