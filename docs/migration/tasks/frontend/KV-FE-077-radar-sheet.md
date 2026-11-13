# KV-FE-077 — Radar subscription sheet

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-RADAR-004, F-RADAR-005 |
| Dependencies | KV-FE-013 (sheet primitive), KV-FE-014 (toast, confirm), KV-FE-075 (radar tab, previews, toggle), KV-FE-079 (survey), KV-FE-047 (thumbnails and price helpers for the finds strip); backend KV-BE-104 (API-021, API-022, `ask_found`), KV-BE-106 (hide rules, `hidden`), KV-BE-045 (API-024); decisions: DEV-016, DEV-022, DEV-033, DEV-034 `PROPOSED`; Q-API-030, Q-API-032 |

## Goal

Tapping a radar tile opens the legacy radar sheet (SCR-028): latest finds, «Присылать в чат» switch, delivery mode
«Сразу» / «Подборкой» with the user's digest hours, «Изменить условия», «Скрыто: N — Вернуть», «Удалить радар» with a
confirmation, and «Смотреть найденное» that opens the radar's feed and returns here on Back — with the failures that
only vibrated made visible (DEV-016) and the count label fixed behind DEV-022.

## Legacy reference

- SCR-028 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:28-156`, `RadarStrip.jsx:16-57`;
  actions in `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:91-183` (`toggle`, `changeMode`, `unhide`,
  `remove`) and `:206-237` (hidden while a listing is open, `RadarScreen.jsx:216`).
- Radar feed and return: `$KVADRO_ROOT/demo/app/src/app/App.jsx:367-378` (`openRadarFeed`),
  `$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:54-79` (radar-return Back).
- Digest hours: `formatDays` «09,21» → «9 и 21» (`$KVADRO_ROOT/demo/app/src/features/settings/format.js:23-27`).
- Rules: BR-APP-047 (mode only while active; «Скрыто: N» only when `hidden > 0`; digest hint), BR-APP-048 (delete needs
  a confirmation; `ask_found` opens the survey), BR-API-091 (`hidden` counts listings suppressed by radar hide rules).
- Defects: LB-APP-027 → DEV-016 (mode, unhide, delete failures vibrate only), LB-APP-034 → DEV-022 (count label),
  LB-BOT-024 → DEV-033 (rules removed all at once), DEV-034 (rule scope).
- Visual baseline: KV-QA-019 scenario `radar-sheet` → `docs/migration/visual-baseline/SCR-028-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/radar/RadarSheet.tsx` on the sheet primitive of KV-FE-013 (grab handle, drag to
   close at 25 % / 0.5 px/ms, backdrop tap, Back handler); `instant` prop skips the rise animation when the sheet is
   restored after a radar feed.
2. Header: title (BR-APP-065 via KV-FE-020), area summary, status dot (`radar-dot` / `off`) + the status line of
   KV-FE-075, × button (`aria-label` `common.close`).
3. «Последние находки» strip (`RadarStrip.tsx`): ghosts (3) while finds are loading; mini-cards with the thumbnail
   (KV-FE-047 helper), the «новое» badge only when the radar is active and the find is not `viewed`, short price
   (`main` + `period`, «—» when absent), `district_name ?? place` · age; then «Все {n} ›» (count known) or
   «Смотреть найденное ›»; no finds → `radar.none`. A mini-card opens the listing over the sheet; the sheet is hidden
   (state kept) while the listing is open.
4. Settings card: «Присылать в чат» switch (same toggle as the tile, KV-FE-075); when active, two radio rows
   `instant` / `digest` with hints; the digest hint uses `GET /api/settings` → `digest` split by «,», leading zero
   dropped, joined with `notify.and`; failure or loading → `radar.digestHintAny`.
5. Mode change: only when different; light haptic; optimistic `PATCH {mode}`; replace with `result.subscription`; failure
   → revert + error haptic, and with DEV-016 (flag `dev016ErrorToastOnFailure`) the toast `common.saveFailed`.
6. Actions card: «Изменить условия ›» opens the radar editor (KV-FE-078); «Скрыто: N — Вернуть» when `hidden > 0`:
   light haptic, `PATCH {unhide:true}`, success → success haptic + toast `radar.unhidden`; failure → error haptic
   (+ `common.saveFailed` with DEV-016). DEV-033 (flag `dev033ConfirmUnhideAll`): ask a confirm before clearing all
   rules; a per-rule list needs an endpoint the legacy surface does not have (v1 only, FD-2) — not built here.
7. «Удалить радар» (danger row): confirm `subs.deleteConfirm` with `name` = radar title (TMA-026); OK → `DELETE`;
   success → close the sheet, drop the radar from the list, success haptic, and when `ask_found` → survey with trigger
   `delete` (KV-FE-079); failure → error haptic (+ `common.saveFailed` with DEV-016). With DEV-016 a success toast
   `toast.subDeleted` confirms the destructive action.
8. Footer: primary «Смотреть найденное · {n}» (count from the preview) or «Смотреть найденное»; tap → close the sheet,
   set the search filters to the radar's filters, fix the sort if unavailable (KV-FE-020), switch to the search tab and
   push the radar-return handler (KV-FE-025) holding `{radar id, scrollY, previous filters, previous sort}`. DEV-022
   (flag `dev022RadarCountLabel`): the button reads `radar.foundPlain` and a muted line above it shows
   `sheet.matchingNow` «Сейчас подходит: {n}»; the strip link becomes `radar.foundPlain`.

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| finds loading | 3 ghost mini-cards |
| finds empty | `radar.none` «Пока ничего — радар пришлёт, как появится» |
| finds | `radar.latest` «Последние находки»; badge `radar.new` «новое»; link `radar.all` «Все {n}» / `radar.foundPlain` «Смотреть найденное» |
| send switch | `radar.send` «Присылать в чат» |
| mode rows (active only) | `subs.mode.instant` «Сразу» + `radar.instantHint` «Каждое новое — как только появится»; `subs.mode.digest` «Подборкой» + `radar.digestHint` «Списком в {time}» (e.g. «Списком в 9 и 21») or `radar.digestHintAny` «Списком в заданное время» |
| actions | `radar.edit` «Изменить условия»; `subs.hidden` «Скрыто: {n}» + `radar.unhide` «Вернуть»; `radar.delete` «Удалить радар» |
| confirm delete | `subs.deleteConfirm` «Удалить радар «{name}»?» |
| unhidden toast | `radar.unhidden` «Скрытое снова показывается» |
| footer | `radar.found` «Смотреть найденное · {n}» / `radar.foundPlain`; with DEV-022 `sheet.matchingNow` «Сейчас подходит: {n}» |
| failure (DEV-016) | `common.saveFailed` «Не получилось сохранить» |
| new key (not in legacy), DEV-016 | `toast.subDeleted` — proposed ru «Радар удалён»; uz/en to be translated, product owner review |
| new key (not in legacy), DEV-033 | `radar.unhideConfirm` — proposed ru «Снова показывать всё, что скрыто в этом радаре?»; uz/en to be translated, product owner review |
| paused radar | finds section greyed (`off`), no mode rows, no «новое» badges |

## Interaction

- Open: rise animation (`rise`, 0.25–0.35 s, `cubic-bezier(.2,.9,.3,1)`), none when restored. Close: ×, backdrop,
  drag down, Telegram Back, opening the feed, delete.
- Strip scrolls horizontally inside the sheet (allowed by the sheet's scroll lock, KV-FE-013).
- Back after «Смотреть найденное» (on the search tab): restores the previous filters, sort and list view, switches to
  the radar tab, reopens this sheet without animation and restores the scroll position (KV-FE-025, KV-FE-075).
- Responsive: sheet width = content column (max 608 px); body scrolls; footer sticky above the bottom inset.

## Telegram integration

TMA-022 (Back handler while open; radar-return handler after opening the feed), TMA-026 (`showConfirm` for delete and
DEV-033), TMA-033 (turning on through the chat-access flow), TMA-025 (haptics).

## Storage and analytics

- Storage: none.
- Analytics: legacy sends no `$pageview` for this sheet (LB-APP-037); the layer tracking of KV-FE-035 reports it as
  `subs/radar` (proposed name; legacy names unchanged).

## Files

- `frontend/app/app/(miniapp)/features/radar/RadarSheet.tsx`, `RadarStrip.tsx` (new)
- `frontend/app/lib/settings/digestLabel.ts` (shared with KV-FE-084)
- `frontend/app/lib/deviations.ts` (flags `dev022RadarCountLabel`, `dev033ConfirmUnhideAll`; `dev016ErrorToastOnFailure`
  shared)
- `frontend/app/tests/radar/RadarSheet.test.tsx`, `frontend/app/e2e/radar-sheet.spec.ts`

## API contract

- API-021 `PATCH /api/subscriptions/:id` with `{"mode": "instant"|"digest"}` or `{"unhide": true}` → `200
  {"subscription": Subscription, …}`; `{"active": bool}` via KV-FE-075. Errors: `404 {"detail":"Not Found"}` (radar
  deleted elsewhere) → reload the list; `422`; `401`; `403 <reason>`.
- API-022 `DELETE /api/subscriptions/:id` → `200 {"ask_found": bool}` or `204` (treat as `ask_found: false`).
- API-024 `GET /api/settings` → `{digest: "HH" | "HH,HH", …}`; errors ignored.
- API-004 / API-005 previews come from KV-FE-075.

## Business rules

- Kept: BR-APP-047, BR-APP-048, BR-API-091 (count meaning kept even with DEV-034).
- DEV-016, DEV-022, DEV-033 `PROPOSED` behind flags; DEV-034 `PROPOSED` server-side scope change — the sheet keeps
  showing `hidden` as a count either way.

## Acceptance criteria

- Mode rows appear only for active radars; the checked row matches `subscription.mode`; the digest hint shows
  «Списком в 9 и 21» for `digest: "09,21"` and «Списком в заданное время» when settings fail.
- «Скрыто: 3 — Вернуть» appears only with `hidden: 3`; after success the row disappears and the toast shows.
- Delete asks «Удалить радар «2-комн. · до $600»?»; Cancel sends nothing; OK sends one `DELETE`; `ask_found: true` opens
  the survey with `trigger: "delete"`.
- «Смотреть найденное» → search tab with the radar's filters; Telegram Back → radar tab with the same sheet open and the
  same scroll position.
- Visual: side by side with the `radar-sheet` baseline (ru light): header, strip, cards, danger row, footer.

## Tests

- Component `RadarSheet.test.tsx`: active vs paused rendering, `hidden` 0/3, ghost/empty/finds strip, digest hint
  variants, `todo('DEV-022 PROPOSED')`, `todo('DEV-033 PROPOSED')`, `todo('DEV-016 PROPOSED')`.
- E2E `radar-sheet.spec.ts`: mode change ok and `500` (revert); unhide; delete with confirm and `ask_found`; open feed
  and Back restores the sheet; open a find → listing over the hidden sheet → Back → sheet visible again.

## Edge cases

- `digest` missing or not a string in API-024 → `radar.digestHintAny` (no `split` on non-strings).
- The radar is deleted from the bot while the sheet is open → next action answers `404` → list reload, sheet closes.
- A find without `cover` → empty thumbnail block; without price → «—».
- The Telegram Settings button while the sheet is open → closes it (KV-FE-025, LB-APP-046 fix).

## Security

- SEC-REQ-014 (radar ids only from the user's list), SEC-REQ-021 (titles, district and price strings as text),
  SEC-REQ-015 (server de-duplicates mode patches).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); visual review of `SCR-028` recorded in the PR; parity
gate G4 for F-RADAR-004 and F-RADAR-005 ticked (`15` §4); rows in `09` updated; PR reviewed by the other developer.
