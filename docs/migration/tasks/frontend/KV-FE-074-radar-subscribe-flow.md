# KV-FE-074 — Radar subscribe flow (create, reactivate, widen, `no_chat`)

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-RADAR-002, F-RADAR-006, F-RADAR-008 |
| Dependencies | KV-FE-014 (toast), KV-FE-019 (filter model, `sameFilters`), KV-FE-021 (API client), KV-FE-030 (chat-access flow); backend KV-BE-101 (API-018), KV-BE-102 (starter, options, `relaxed`), KV-BE-103 (API-019/020), KV-BE-104 (API-021), KV-BE-105 (API-023); decisions: DEV-005, DEV-009, DEV-016 `PROPOSED`; Q-APP-006, Q-API-031, Q-API-034 |

## Goal

One shared, UI-free radar action module that every entry point uses — filters sheet «Включить радар», the few-results
note, the follow nudge, the new-radar sheet, the radar editor and «Расширить» — with the legacy decision order
(re-read list → already on → reactivate → create), the legacy toasts, the `409 no_chat` write-access seam and the
radar limit, and without the legacy false «Не получилось сохранить» after a successful save (LB-APP-005).

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:16-185` (`subscribe`, `saveEdit`, `relax`,
  `emptyResultToast`, `DEFAULT_MAX_SUBSCRIPTIONS = 10`, `RELAX_MIN_COUNT = 7`).
- `$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:15-55` (`isNoChatError`, `withChatAccess`), TMA-033.
- Subscriptions list refresh on entering the search tab and after radar changes: `$KVADRO_ROOT/demo/app/src/app/App.jsx:173-177`.
- Entry points: `App.jsx:582` (`filters`), `:599` (`empty`), `:310` (`few`), `:631` (`prompt`) — `08` API-019 input.
- Rules: BR-APP-041 (turning on a radar), BR-APP-042 (widen suggestion), BR-APP-048 (chat-access only when turning
  on), BR-APP-012 (`filtersKey` ignores `posted_days`), BR-API-092 (client-side duplicate check), LB-API-013 (retry
  after `no_chat` can create a twin).
- Defects: LB-APP-005 (TypeError on missing `relaxed`, false failure toast).
- Contract: API-018, API-019, API-020, API-021, API-023 (`08` §2; models `Subscription`,
  `SubscriptionMutationResult` in `08` §1.8).

## Implementation

1. `frontend/app/lib/radar/subscriptionStore.ts`: an in-memory list of the user's radars (session state, `03` §1.11),
   loaded through the request cache (KV-FE-023) with `GET /api/subscriptions` when the search tab is entered and after
   every radar mutation (`subsVersion` counter, `App.jsx:173-177`); errors keep the previous list.
2. `frontend/app/lib/radar/normalize.ts`: total normalisers for every radar response — `relaxed` missing or not an
   array → `[]`; `options` missing → `[]`; `starter` not a finite number → `0`; `subscription.filters` passed through
   `normalizeFilters()` of KV-FE-019 (25 keys, `zones ?? []`); `mode` outside `instant|digest` → kept but labelled
   through the enum table of KV-FE-015 (never a throw). This is the LB-APP-005 fix: a request that returned `2xx` always
   ends in a success toast.
3. `frontend/app/lib/radar/actions.ts` exports `subscribe(filters, entry, relaxed?)`, `saveEdit(id, filters,
   relaxed?)`, `relax(id, code)`, all returning `{ok, toast}` so the caller (sheet, nudge, note) decides about closing:
   - `subscribe`: re-read API-018 (fallback: the cached list); find a twin with `sameFilters` (KV-FE-019, ignores
     `posted_days`); active twin → no request, toast `toast.alreadyOn`, `ok: true`; inactive twin → `PATCH {active:true}`
     through the chat-access flow, toast `toast.alertOn`; otherwise `POST {filters, entry, relaxed?}` through the
     chat-access flow; `relaxed` omitted from JSON when not chosen (`08` §1.3).
   - `saveEdit`: `PUT {filters, relaxed?}` through the chat-access flow.
   - `relax`: `POST /api/subscriptions/:id/relax {code}` through the chat-access flow.
4. Toast choice after a successful create or edit (`emptyResultToast`): `starter > 0` → count toast; otherwise the first
   option with `count ≥ 7`, else the last option → «few» toast with the action `toast.relax` «Расширить» that calls
   `relax(subscription.id, option.code)`; no option → «empty» toast with `hint = relaxed[0] ? " — " + relaxed[0].text : ""`.
5. Errors: `isNoChat(error)` (`409` with `detail === "no_chat"`) → `toast.noChat`; `409` with `detail ===
   "subscription_limit"` or any other non-`no_chat` `409` on create → `toast.subLimit` with `max = meta.max_subscriptions
   ?? 10`; `409 duplicate` (DEV-009 server answer to a `PUT` into a twin, KV-BE-103) → `toast.alreadyOn`; anything else →
   `common.saveFailed`. Haptics: `success` / `error` notification (KV-FE-029).
6. The chat-access wrapper is KV-FE-030 (`withChatAccess(request, meta.bot_username)`): one automatic repeat after
   `requestWriteAccess` grants, else the `chat.restart` confirm and `https://t.me/<bot>`; this module only maps the final
   error to a toast. Turning a radar **off** never goes through it (BR-APP-048).
7. Counts in toasts use the plural `listings` through `formatListingsCount` of KV-FE-018 («3 объявления»).
8. DEV-005 (flag `dev005RadarDropsPostedDays`, default off): when on, `posted_days` is sent as `null` on create and
   edit; off → sent as it is in the feed filters (legacy).
9. DEV-009 (server, `PROPOSED`): keep the client pre-check regardless — with DEV-009 the server also returns the existing
   radar for a `POST` twin, so the response shape is unchanged; no flag needed on the client.

## States and texts

| State | Trigger | Toast (key, ru) |
| ----- | ------- | --------------- |
| already on | active twin found | `toast.alreadyOn` «Радар по этому поиску уже включён» |
| reactivated | inactive twin, `PATCH` ok | `toast.alertOn` «Радар снова включён» |
| created, starter | `POST` ok, `starter > 0` | `toast.subSaved` «Радар включён. {count} уже в чате с ботом» |
| created, few | `starter = 0`, options present | `toast.subSavedFew` «Радар включён, но таких объявлений мало. {what}: {rate}» + action `toast.relax` «Расширить» |
| created, empty | `starter = 0`, no options | `toast.subSavedEmpty` «Радар включён — новые придут в чат, как только появятся{hint}» |
| edited, starter | `PUT` ok, `starter > 0` | `toast.subUpdated` «Радар обновлён. {count} под новые условия — в чате с ботом» |
| edited, few | as created | `toast.subUpdatedFew` «Радар обновлён, но таких объявлений мало. {what}: {rate}» + `toast.relax` |
| edited, empty | as created | `toast.subUpdatedEmpty` «Радар обновлён. Пока пусто{hint}» |
| widened | relax ok | `starter > 0` → `toast.subUpdated`; else `toast.relaxedEmpty` «Радар расширен — новые придут в чат, как только появятся» |
| no chat | final `409 no_chat` | `toast.noChat` «Радар не включён — боту нужно разрешение писать вам в чат» |
| limit | `409` not `no_chat` on create | `toast.subLimit` «Уже {max} радаров — удалите ненужный во вкладке «Радар»» |
| failure | other errors | `common.saveFailed` «Не получилось сохранить» |
| loading / disabled | request in flight | the calling sheet disables its submit button (KV-FE-078, KV-FE-050) |

The confirm text after an unrecoverable `no_chat` is `chat.restart` «Бот не может писать вам — похоже, он остановлен.
Открыть чат с ботом? Нажмите там «Перезапустить» и включите радар снова.» (KV-FE-030).

## Interaction

- No UI of its own; callers render the result. Toasts with an action live 6 s, plain toasts 4 s (KV-FE-014).
- A double tap on a submit button is ignored by the caller's `submitting` state; the module itself serialises calls per
  filters key (a second `subscribe` with the same `filtersKey` while one is in flight returns the first promise).

## Telegram integration

TMA-033 (`requestWriteAccess` after `409 no_chat`, version 6.9+), TMA-026 (`showConfirm` for `chat.restart`), TMA-028
(`openTelegramLink` to the bot), TMA-025 (success/error haptics).

## Storage and analytics

- Storage: none.
- Journal events: `chat_access_declined`, `chat_access_allowed` (sent by KV-FE-030). No other event; no `$pageview`.

## Files

- `frontend/app/lib/radar/subscriptionStore.ts`, `actions.ts`, `normalize.ts`, `toasts.ts` (new)
- `frontend/app/lib/deviations.ts` (flag `dev005RadarDropsPostedDays`)
- `frontend/app/tests/radar/actions.test.ts`, `normalize.test.ts` (after KV-FE-010)

## API contract

- API-018 `GET /api/subscriptions` → `200 Subscription[]` (bare array; `{id, active, mode, filters (25 keys), hidden}`).
- API-019 `POST /api/subscriptions` `{"filters", "entry": "filters"|"empty"|"few"|"prompt", "relaxed"?}` → `200
  {"subscription", "starter", "options"?: [{code, label, rate, count}], "relaxed": [{text}]}`.
- API-020 `PUT /api/subscriptions/:id` `{"filters", "relaxed"?}` → same result.
- API-021 `PATCH /api/subscriptions/:id {"active": true}` (reactivation path) → `{"subscription", "starter"?, "ask_found"?}`;
  the result is not read on this path (legacy).
- API-023 `POST /api/subscriptions/:id/relax {"code"}` → `{"starter"}`.
- Errors: `409 {"detail":"no_chat"}` (before any change), `409 {"detail":"subscription_limit"}`, `409
  {"detail":"duplicate"}`, `422 {"detail":"invalid_<field>"}`, `401`, `403 <reason>` (access screen per DEV-001),
  `429`.

## Business rules

- Kept: BR-APP-041, BR-APP-042, BR-APP-048, BR-APP-012, BR-API-092.
- Defect fix `APPROVED` (policy): LB-APP-005 (normalised results; success toast whenever the request succeeded).
- DEV-005 `PROPOSED` (flag), DEV-009 `PROPOSED` (server; no client change), DEV-016 `PROPOSED` (callers use the error
  toasts above even where legacy only vibrated).

## Acceptance criteria

- With an active twin, no `POST` is sent and «Радар по этому поиску уже включён» appears; with an inactive twin a single
  `PATCH {active:true}` is sent and «Радар снова включён» appears.
- A `POST` answered `200 {"subscription": …, "starter": 0}` (no `options`, no `relaxed`) shows
  `toast.subSavedEmpty` with an empty hint and returns `ok: true` (LB-APP-005 regression case).
- The relax option offered is the first with `count ≥ 7`, else the last; tapping «Расширить» sends its `code`.
- `409 no_chat` → write-access request → granted → the same request is repeated exactly once; declined → `toast.noChat`.
- Visual: toasts match the legacy toast pill of SCR-042 (baseline `listing-hide` for the pill style).

## Tests

- Unit `normalize.test.ts`: missing `relaxed`, `relaxed: null`, `options: null`, `starter: "3"`, filters with 24 keys,
  legacy `zone` key, unknown `mode`.
- Unit `actions.test.ts` (contract mocks of KV-FE-022): `already_on_active_twin_no_request`, `inactive_twin_patches`,
  `create_starter_toast`, `create_few_picks_first_count_ge_7`, `create_few_falls_back_to_last`, `create_empty_hint`,
  `edit_toasts`, `relax_starter_and_empty`, `no_chat_granted_retries_once`, `no_chat_declined_toast`,
  `limit_409_uses_meta_max_or_10`, `duplicate_409_already_on`, `other_error_save_failed`, `posted_days_kept_by_default`,
  `todo('DEV-005 PROPOSED')`.

## Edge cases

- The re-read of API-018 fails → compare against the cached list (legacy fallback).
- Two entry points fire for the same filters (nudge «Включить» and the sheet) → one request (serialised by key).
- `meta` not loaded yet (`max_subscriptions` unknown) → limit toast with `10`.
- The radar list contains a radar whose filters carry an unknown type → `sameFilters` still works on the normalised
  form; the title falls back through the enum table (LB-APP-002).

## Security

- SEC-REQ-014 (owner-scoped ids come only from the user's own list), SEC-REQ-015 (the server de-duplicates; the client
  serialisation only reduces noise), SEC-REQ-017 (filters normalised before sending), SEC-REQ-019 (only
  `https://t.me/<bot>` opened after `chat.restart`).
- No `initData` or filter contents in error reports (TMA-009).

## Definition of done

`make ci-frontend` green; unit tests green (or added as soon as KV-FE-010 lands); parity gate G4 for F-RADAR-002,
F-RADAR-006 and F-RADAR-008 ticked with the PR link (`15` §4); rows in `09` updated; PR reviewed by the other
developer.
