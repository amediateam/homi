# KV-FE-042 — No-access screen

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-ACCESS-002 |
| Dependencies | KV-FE-040 (bootstrap and render gating), KV-FE-037 (start-param source), KV-FE-029 (links, close), KV-FE-016 (catalogues), KV-FE-034 (event journal); backend KV-BE-009 (access gate), KV-BE-022 (API-003); decisions: DEV-001 `PROPOSED`, Q-APP-014 |

## Goal

When the backend refuses the user with one of the five access reasons, the Mini App shows the legacy no-access screen
(SCR-003) with the same texts, re-checks access automatically after «Старт» in the bot, and offers the way out to the
bot, the source post or support. With DEV-001 approved, a `403` from **any** protected endpoint routes here instead of
showing «Нет доступа — повторить» (LB-APP-045).

## Legacy reference

- Screen: SCR-003 (`03` §2), `$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:1-88`; opened by
  `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:127-140`; reasons whitelist `NoAccessScreen.jsx:13,22`.
- Start source and post link: TMA-011, `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:32-54`; deep links
  created: TMA-013 (`?start=s_<source>[--l<id>]`, `t.me/<support>`).
- Re-check timing: `03` §3.4 («Access re-check after 403 | 3 × 2.5 s (not for `blocked`)»); visibility retry TMA-040.
- Rules: BR-APP-054, BR-API-011…BR-API-016 (gate semantics, server side).
- Defects and deviations: LB-APP-045 → DEV-001; LB-APP-027 (haptic-only failures, not applicable here); LB-APP-032
  (language detection) → DEV-020.
- Contract: API-001 errors (`08` §2: `403 {"detail": "private"|"invite"|"full"|"blocked"|"join"}`), API-003.
- Visual baseline: KV-QA-019 scenario `no-access-403` → `docs/migration/visual-baseline/SCR-003-*.png`.

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` (client-only screens
   inside the `(miniapp)` root layout).
2. `frontend/app/app/(miniapp)/features/onboarding/NoAccessScreen.tsx` (Client Component): props `reason`,
   `checking`, `bot` (`{username, support}` from API-003), `startParam` (from KV-FE-037).
3. Normalise the reason with a closed table `ACCESS_REASONS = ['private','invite','full','blocked','join']`; anything
   else (including a missing or non-string `detail`) → `private`.
4. Primary action, in legacy order (`NoAccessScreen.jsx:61-73`): if the reason is not `blocked`, the bot username is
   known and the start param is an `l_<id>…` link → «Перейти в бота» opens
   `https://t.me/<bot>?start=s_<source>[--l<id>]` through `openTelegramLink` (KV-FE-029); otherwise «Вернуться в бот»
   calls `WebApp.close()`. `<source>` is `web`, a campaign code `(fb|tg|ig)\d{1,4}`, `seo` or `share` (TMA-011).
5. Secondary rows: «📢 Открыть пост в канале» only when the start param matches
   `l_<id>-[seo-]<channel 4-32>-<post 1-12>` → `https://t.me/<channel>/<post>`; «Написать в поддержку» only when API-003
   returns `support` → `https://t.me/<support>`.
6. The checking line is driven by the bootstrap (KV-FE-040): while an automatic re-check is pending (3 tries at 2.5 s,
   never for `blocked`) show `noAccess.checking`. `visibilitychange` → visible resets the counters and re-checks at once,
   also for `blocked` (API-001 errors row).
7. Before rendering, set the UI locale from the Telegram language with the single detector of KV-FE-015 (`uz*` → `uz`,
   `en*` → `en`, else `ru`) — the legacy screen can appear in English (`useAppBootstrap.js:132`).
8. DEV-001 (flag `dev001AnyForbiddenShowsAccess` in `frontend/app/lib/deviations.ts`, default off): the API client
   (KV-FE-021) raises `AccessDenied(reason)` for a `403` on any protected route; the bootstrap provider catches it at
   the layer boundary and switches the app to this screen. With the flag off, the feed keeps the legacy inline
   «Нет доступа — повторить» (KV-FE-048).
9. Lock icon from the icon set (`lucide-react` `Lock` once approved by KV-FE-005; an inline SVG in `@homi/ui` until
   then); layout `main.lang-pick` equivalent with the large-button list from `@homi/ui` (KV-FE-012).

## States and texts

Keys are the legacy catalogue keys (`$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js`), ru values quoted.

| State | Shown when | Texts (keys) | Controls |
| ----- | ---------- | ------------ | -------- |
| `private` (default) | `detail = private`, unknown or missing | `noAccess.title.private` «Бот приватный», `noAccess.text.private` «Приложение сейчас доступно только владельцу.» | primary + support |
| `invite` | `detail = invite` | `noAccess.title.invite` «Закрытая бета», `noAccess.text.invite` «Войти можно по ссылке-приглашению: откройте её и нажмите «Старт» в боте.» | primary + post + support |
| `full` | `detail = full` | `noAccess.title.full` «Мест пока нет», `noAccess.text.full` «Все места в бете заняты. Попробуйте позже.» | primary + support |
| `blocked` | `detail = blocked` | `noAccess.title.blocked` «Нет доступа», `noAccess.text.blocked` «Доступ к приложению закрыт.» | «Вернуться в бот» only; no automatic re-check |
| `join` | `detail = join` | `noAccess.title.join` «Сначала — бот», `noAccess.text.join` «Нажмите «Старт» в боте — после этого приложение откроется.» | primary + post + support |
| checking (overlay line) | re-check pending | `noAccess.checking` «Только что нажали «Старт»? Подождите пару секунд — проверяем доступ…» | buttons stay enabled |
| loading | API-003 not answered yet | no button labels change; the support row appears when `support` arrives | — |
| error (API-003 failed) | non-2xx or network | fallback `{username: null, support: null}`: primary becomes «Вернуться в бот», no support row | — |
| success | a later API-001 answers `200` | the screen unmounts and the app shell renders (KV-FE-040) | — |

Button labels: `noAccess.toBot` «Перейти в бота», `noAccess.back` «Вернуться в бот», `noAccess.openPost`
«📢 Открыть пост в канале», `settings.support` «Написать в поддержку». uz and en values come from the catalogues of
KV-FE-016 (en titles «This bot is private», «Closed beta», «No spots yet», «No access», «Start with the bot»).

## Interaction

- Tap «Перейти в бота»: medium haptic (KV-FE-029), open the bot link; the Mini App stays open (the user comes back
  after «Старт» and the visibility retry re-checks).
- Tap «Вернуться в бот»: `WebApp.close()` (TMA-039); outside Telegram the screen is never shown (SCR-002 wins).
- Tap the post or support rows: `openTelegramLink`, 1.5 s same-URL debounce (TMA-028).
- No gestures, no Back handler: this is a base screen (TMA-022 stack empty → Telegram shows Close).
- Responsive: one centred column, max width 608 px, safe-area padding from KV-FE-026; Telegram Desktop windows keep
  the same column.

## Telegram integration

TMA-011 (source formats), TMA-013 (links created), TMA-028 (`openTelegramLink`), TMA-039 (`close`), TMA-040
(visibility retry), TMA-008 (language before meta), TMA-025 (haptics).

## Storage and analytics

- Storage: none written. Reads nothing except the locale detector input.
- Analytics: no `app_opened` after a `403` (legacy, `$KVADRO_ROOT/docs/api.md` §11); `app_launch` was already sent by
  the bootstrap. No `$pageview` (analytics is not initialised without meta); keep it that way — LB-APP-037 is fixed only
  for screens reached after meta.

## Files

- `frontend/app/app/(miniapp)/features/onboarding/NoAccessScreen.tsx` (new)
- `frontend/app/app/(miniapp)/features/onboarding/accessReason.ts` (new: reason table, link builder)
- `frontend/app/lib/deviations.ts` (flag `dev001AnyForbiddenShowsAccess`)
- `frontend/app/tests/onboarding/NoAccessScreen.test.tsx`, `frontend/app/e2e/no-access.spec.ts` (after KV-FE-010)

## API contract

- API-001 `GET /api/meta` → `403 {"detail": "<reason>"}`; `detail` read only when it is a string (`08` §1.5).
- API-003 `GET /api/bot` (no `Authorization`) → `200 {"username": string, "support": string|null}`; non-2xx → local
  fallback `{username: null}`.
- With DEV-001: any protected legacy route may answer `403 {"detail": "<reason>"}` (SEC-REQ-006); the client treats
  them all alike.

## Business rules

- Kept: BR-APP-054 (five reasons, unknown → `private`, 3 × 2.5 s re-check except `blocked`, visibility retry);
  BR-API-014 (gated users get `403` on feed, favourites, history).
- DEV-001 `PROPOSED`: any `403` shows this screen (behind the flag; test `todo('DEV-001 PROPOSED')`).
- DEV-020 `PROPOSED`: one language detector (affects which language this screen uses before meta).

## Acceptance criteria

- For each of the five reasons the title, text and controls match the table above in ru, uz and en.
- An unknown reason (`"foo"`), a missing body and an array `detail` all render the `private` state.
- `blocked` never shows the checking line and never re-checks automatically; returning to the app re-checks once.
- After three automatic re-checks the checking line disappears; a later `200` closes the screen without a reload.
- «Перейти в бота» carries `s_web--l123` for `start_param=l_123-web`, `s_fb12--l123` for `l_123-fb12`,
  `s_seo--l123` for `l_123-seo-chan-45`, `s_share--l123` for `l_123`; without a start param the button is
  «Вернуться в бот».
- Visual: side by side with `SCR-003` baselines of KV-QA-019 (ru light; dark and en where captured) — layout, icon,
  button order and texts equal; differences only where a DEV flag is on.

## Tests

- Unit (`accessReason.test.ts`): reason normalisation table (5 known, unknown, `null`, number, array); source parsing for
  `l_123`, `l_123-web`, `l_123-ig7`, `l_123-seo`, `l_123-seo-example_channel-45`, `l_123-example_channel-45`, `l_abc`;
  link builder output and the 64-character `start` limit.
- Component (`NoAccessScreen.test.tsx`): one render per reason × locale; support row hidden when `support` is `null`;
  post row only for channel/post sources.
- E2E (`no-access.spec.ts`, contract mocks of KV-FE-022): meta `403 join` → screen → mock switches to `200` after
  2.5 s → shell renders; meta `403 blocked` → no re-check for 10 s; `visibilitychange` → one re-check.
- DEV-001: `todo('DEV-001 PROPOSED')` — feed `403` routes to this screen.

## Edge cases

- API-003 never answers (network): buttons render with the fallback; no spinner on the screen itself.
- A `403` arrives while a listing deep link is open: the screen replaces the shell; the listing id is kept for the
  `--l<id>` suffix.
- `start_param` longer than Telegram's 64 characters or with Unicode: treated as no source (`share` only when it is a
  bare `l_<digits>`).
- The bot username contains uppercase letters: kept as returned (Telegram usernames are case-insensitive).

## Security

- SEC-REQ-005 / SEC-REQ-006: the client never infers access from anything but the server reason; no access state is
  cached across launches.
- SEC-REQ-019: only `https://t.me/…` links are opened; the channel and post parts are validated by the regex above
  before building a URL.
- TMA-009: `initData` and the raw `start_param` are not logged or sent to analytics; only the derived source code is
  used in the bot link.

## Definition of done

`make ci-frontend` green; unit, component and E2E tests green (or added as soon as KV-FE-010 lands); visual review of
the SCR-003 baselines recorded in the PR; parity gate G4 for F-ACCESS-002 ticked with the PR link (`15` §4); the
F-ACCESS-002 row in `09` updated; PR reviewed by the other developer.
