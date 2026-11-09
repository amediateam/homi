# KV-FE-106 — Bot and Mini App link builders for landing and SEO

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-LANDING-005, F-SEO-010 |
| Dependencies | KV-FE-101 (slices), KV-FE-105 (visit id); KV-BE-159 (`bot_payload` per slice), KV-BE-160 (card deep links), KV-BE-154 / KV-BE-155 (landing `link` fields); bot parser KV-TG-015; decisions: DEV-040, DEV-049 `PROPOSED`, Q-LND-004, Q-LND-005, Q-SEO-012 |

## Goal

Every link from the web into Telegram is built in one module and stays within the legacy grammars: the landing's
`s_web[_<tag>][--v<visit>]` bot links, the SEO pages' `s_seo[_<lang>][_<slice>]` CTAs, the `startapp` listing links of
the landing data and the SEO cards, and the plain support, Instagram and channel links — validated for length and
characters at generation time, with the attribution improvements of DEV-040 and DEV-049 behind flags.

## Legacy reference

- LND-030 (landing buttons get `?start=s_web[_<tag>][--v<visit>]`; four of them: hero, final, dock, the radar «+»
  inside the phone; listing links in the demo come from the data and are not tagged; the QR carries no tag), LND-062
  (SEO cards → `startapp=l_<id>-seo-<channel>-<post>`; CTA → `start=s_seo[_<lang>][_<slice>]`, `--v<visit>` appended at
  click time).
- URL-045…URL-056, URL-006 (`?s=` / `?utm_source=`), deep-link grammar `03b` §6.3. URL-056 (`l_<id>-<channel>-<post>`
  without `seo`, UNVERIFIED) is never emitted by the landing; the validator accepts it for parser tolerance.
- Rules: BR-LND-001 (landing payload: tag from lowercased `?s=`, else `?utm_source=`, `^[a-z0-9_-]{1,40}$`, invalid
  dropped silently; `--v` + visit if `^[a-z0-9]{10}$`; at most 59 characters; applied as
  `href.split("?")[0] + "?start=" + START`), BR-SEO-025 (CTA grammar and slice tags), BR-SEO-026 (card deep link and the
  Mini App parser regexes), BR-LND-017 (click targets in the live map).
- Source: `$KVADRO_ROOT/demo/landing/site/landing.js:26-44`; `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:2-54`.
- Deviations: LB-LND-007 → DEV-040 (QR with `s_web_qr`, tags in `startapp`), LB-SEO-011 → DEV-049 (formal `s_seo`
  grammar).

## Implementation

1. `frontend/landing/lib/links/telegram.ts`:
   - `botUrl(payload?)` → `https://t.me/<NEXT_PUBLIC_TELEGRAM_BOT_USERNAME>[?start=<payload>]` (`KvadroAppBot` in
     production; staging and local use their own bot, so payloads are testable end to end);
   - `webPayload({s, utm_source}, visit)` per BR-LND-001 (returns `s_web`, `s_web_<tag>`, with `--v<visit>`), asserting
     ≤ 59 characters and `[A-Za-z0-9_-]`;
   - `seoPayload(slice, lang)`: takes `bot_payload` from the slice of `GET /api/v1/public/seo/slices/{key}` (KV-BE-159)
     and validates it against the BR-SEO-025 grammar and ≤ 49 characters (so `--v<visit>` fits in 64); a payload that
     fails validation falls back to the section tag (`s_seo`, `s_seo_sale`, `s_seo_new`) and is reported in the build
     log — never truncated silently;
   - `listingStartapp(link)`: accepts the `link` or deep-link fields delivered by the backend (`l_<id>-web`,
     `l_<id>-seo-<channel>-<post>`), validates them with the parser regexes of BR-SEO-026 (`^l_(\d+)`,
     `^l_\d+-(?:seo-)?([A-Za-z0-9_]{4,32})-(\d{1,12})$`) and ≤ 64 characters; invalid → the bot fallback link
     (BR-LND-017 "otherwise the first bot link").
2. `frontend/landing/components/BotLink.tsx` (Client Component): renders `<a href={botUrl()}>` in the server HTML (the
   no-JS legacy behaviour: bare bot link, LND-001) and, after hydration, rewrites `href` with `webPayload(searchParams,
   getVisit())` — the landing is statically cached, so the tag must be applied on the client as legacy does.
   `target`/`rel` as legacy (same tab for the CTA; `_blank` + `noopener` for listing links).
3. SEO CTAs render the server-built `seoPayload` href; the click-time `--v` suffix is added by KV-FE-105.
4. DEV-040 flag `dev040AttributedQr` in `frontend/landing/lib/deviations.ts` (default off): on → the QR asset encodes
   `https://t.me/<bot>?start=s_web_qr` (a regenerated static SVG committed with its decoded content recorded in the
   PR); the `startapp` tag suffix `-web-<tag>` is produced by the backend config (KV-BE-154) and only validated here.
   Off → the legacy bare-link QR (`img/qr-bot.svg`).
5. DEV-049 is a backend switch (`seo.payload_grammar`, KV-BE-159); the validator accepts both grammars.
6. Support, Instagram and channel links: `https://t.me/KvadroSupportBot` (URL-050; target per DEC-21),
   `https://www.instagram.com/kvadro.app/` (URL-060), `https://t.me/<channel>/<post>` (URL-059) — constants and a
   builder, all `https://`, hosts allow-listed (SEC-REQ-019).

## States and texts

n/a — a link module. Link labels belong to the pages (`landing` `cta` «Открыть в Telegram»; SEO CTA texts of
BR-SEO-031 in KV-FE-114).

## Interaction

- The tagged `href` is visible on hover after hydration (legacy sets it at script start).
- Without JavaScript every CTA still opens the bot (bare link).

## Telegram integration

Produces `start` payloads parsed by the bot (KV-TG-015: `s_web…`, `s_seo…`, `s_<source>--l<id>`) and `startapp`
parameters parsed by the Mini App (TMA-010, TMA-011; new Mini App parser KV-FE-037). No WebApp API is used.

## Storage and analytics

Reads `sessionStorage` `kv-visit` through KV-FE-105; writes nothing.

## Files

- `frontend/landing/lib/links/telegram.ts`, `frontend/landing/components/BotLink.tsx` (new)
- `frontend/landing/public/img/qr-bot.svg` (legacy asset) and, behind the flag, `qr-bot-s_web_qr.svg`
- `frontend/landing/lib/deviations.ts` (`dev040AttributedQr`)
- `frontend/landing/tests/telegram-links.test.ts`

## API contract

- `GET /api/v1/public/seo/slices/{slice_key}?lang=` (KV-BE-159) → `data.bot_payload`; cards (KV-BE-160) carry the
  `startapp` parameter or link.
- Landing data `link` fields (RES-010, RES-011, RES-012; KV-BE-154, KV-BE-155).

## Business rules

- Kept: BR-LND-001, BR-SEO-025, BR-SEO-026, BR-LND-017; the legacy payloads stay valid (`03b` §6.1 "payload
  tolerance").
- DEV-040 `PROPOSED` behind `dev040AttributedQr` (test `todo('DEV-040 PROPOSED')`); DEV-049 `PROPOSED` (backend switch;
  validator test `todo('DEV-049 PROPOSED')` for the v2 grammar).
- LB-LND-007 item 4 fixed: payloads are validated at build time instead of silently cut.

## Acceptance criteria

- `/?s=Insta_1` → every landing CTA `https://t.me/KvadroAppBot?start=s_web_insta_1--v<visit>`; `/?utm_source=tg` →
  `s_web_tg--v…`; `/?s=bad%20tag` → `s_web--v…` (landing parity scenario `source-tag`, KV-QA-013).
- Payload lengths: every generated landing payload ≤ 59 characters; every SEO payload ≤ 49 before the visit suffix.
- SEO card links match `^https://t\.me/KvadroAppBot\?startapp=l_\d+-seo-[A-Za-z0-9_]{4,32}-\d{1,12}$` and are ≤ 64
  characters after `startapp=`.
- The URL suite of KV-QA-014 rows URL-045…URL-055 accepts every generated link.

## Tests

- Unit: `webPayload` table (no tag, `s`, `utm_source`, both, invalid, 41-character tag, invalid visit); `seoPayload`
  grammar for every slice type of BR-SEO-025 incl. `s_seo_uz_kv_yunusobod-minor`; `listingStartapp` on valid and
  invalid inputs.
- `todo('DEV-040 PROPOSED')`, `todo('DEV-049 PROPOSED')`.

## Edge cases

- `?s=` in upper case → lowercased; a tag with Cyrillic → dropped.
- A bot username environment variable missing at build → build fails (no silent `https://t.me/undefined`).
- Channel names of exactly 4 and 32 characters; post numbers of 12 digits.

## Security

SEC-REQ-019 (only `https://t.me` and the allow-listed hosts); payloads contain no personal data, only tags, slice
codes, listing numbers and the random visit id.

## Definition of done

`make ci-frontend` green; link tests green; parity gate G4 for F-LANDING-005 and F-SEO-010 ticked (`15` §4); `09` rows
updated; PR reviewed by the other developer.
