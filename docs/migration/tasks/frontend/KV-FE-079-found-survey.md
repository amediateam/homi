# KV-FE-079 — «Нашли жильё?» survey

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-DELIVERY-007 |
| Dependencies | KV-FE-013 (sheet primitive), KV-FE-030 (share fallbacks); backend KV-BE-044 (API-032, API-033); decisions: Q-API-030 (when `ask_found` is true); FD-8 (brand image `hooray.webp`) |

## Goal

After the server asks for it (`ask_found` on pausing or deleting a radar), the Mini App shows the legacy three-step
survey (SCR-031): «Нашли жильё?» → «Где нашли?» or the congratulations step with «Рассказать друзьям», sends the answers
fire-and-forget and closes with the legacy toasts.

## Legacy reference

- SCR-031 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:28-76` (answer and «where» options with
  their icons), `:85-184` (steps, haptics, toasts, share, portal).
- Triggers: `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:111-114` (`pause`), `:176-178` (`delete`).
- Share link: `https://t.me/<bot>?start=s_friend` (TMA-013, URL-049) with `found.shareText`; share fallback
  `t.me/share/url` (TMA-031, URL-058).
- Rules: BR-APP-049 (answers and their effects), BR-APP-048 (`ask_found` after pause or delete).
- Contract: API-032, API-033 (`08` §2).
- Visual baseline: KV-QA-019 scenario `found-pause` → `docs/migration/visual-baseline/SCR-031-*.png` (step `ask`).

## Implementation

1. `frontend/app/app/(miniapp)/features/radar/FoundSheet.tsx` on the sheet primitive of KV-FE-013 rendered through a
   portal (legacy portals to `document.body`); props `trigger: 'pause' | 'delete'`, `botUsername`, `onClose`.
2. Steps: `ask` → rows `kvadro`, `elsewhere`, `searching`, `stopped` with icons (party popper, house, search, ban);
   `where` → rows `telegram`, `olx`, `site`, `agent`, `friends`, `street`, `other` (send, shopping bag, globe, handshake,
   users, signpost, ellipsis); `kvadro` → image `hooray.webp` 132 × 132 (brand layer, FD-8), title, text, share and done.
3. `pickAnswer(answer)`: light haptic; `POST /api/found {answer, trigger}` fire-and-forget (errors swallowed);
   `kvadro` → success haptic + step `kvadro`; `elsewhere` → step `where` and scroll the sheet to the top; `searching` /
   `stopped` → close + toast.
4. `pickWhere(where)`: light haptic; `POST /api/found/where {where}` fire-and-forget; close + toast `found.thanksYes`.
5. «Рассказать друзьям» (only when the bot username is known): light haptic; share `https://t.me/<bot>?start=s_friend`
   with `found.shareText` through the URL-share helper of KV-FE-030 (`openTelegramLink('https://t.me/share/url?…')` in
   Telegram, `navigator.share` or a new tab outside); then close. «Готово» closes.
6. The survey can render over the radar tiles or over the empty state (KV-FE-076); the radar sheet is closed first when
   the trigger is `pause`.

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| step `ask` | `found.title` «Нашли жильё?»; `found.text` «Подскажите одной кнопкой — так мы поймём, помогает ли kvadro² искать.»; rows `found.kvadro` «Да, через kvadro²», `found.elsewhere` «Да, в другом месте», `found.searching` «Ещё ищу», `found.stopped` «Больше не ищу» |
| step `where` | `found.whereTitle` «Где нашли?»; `found.whereText` «Подскажите — так мы поймём, каких объявлений нам не хватает.»; rows `found.where.telegram` «Другой Telegram-канал», `found.where.olx` «OLX», `found.where.site` «Другой сайт (Uybor, Uysot…)», `found.where.agent` «Через риелтора», `found.where.friends` «Знакомые подсказали», `found.where.street` «Объявление на доме или на улице», `found.where.other` «Другое» |
| step `kvadro` (success) | `found.congrats` «Поздравляем с новосельем!»; `found.congratsText` «Спасибо, что рассказали. Если kvadro² помог — расскажите друзьям, им тоже пригодится.»; `found.share` «Рассказать друзьям» (only with a bot username); `found.done` «Готово» |
| toasts | `found.thanksSearching` «Удачи в поиске! Радар можно снова включить в любой момент»; `found.thanksStopped` «Понятно, спасибо! Радар можно снова включить в любой момент»; `found.thanksYes` «Поздравляем! 🎉 Спасибо, что рассказали» |
| share text | `found.shareText` «Квартира нашлась через kvadro² 🎉 Бот собирает объявления из Telegram-каналов в одну ленту, убирает повторы, помечает, где хозяин, а где риелтор, и сам присылает новые по фильтрам. Если ищешь жильё — попробуй, это бесплатно.» |
| loading / error / disabled | none: requests are fire-and-forget; rows never disable |

The brand name «kvadro²» inside these strings belongs to the brand layer for S6 (CF-008, FD-8).

## Interaction

- Close: backdrop, drag down, Telegram Back, any final answer. No × (legacy).
- The header shows a shadow when the body is scrolled (`useScrolled` behaviour of KV-FE-013); the `kvadro` step has no
  header title.
- Layout: compact sheet, rows as the city-list style with a 20 px icon; one column.

## Telegram integration

TMA-022 (Back handler), TMA-031 (share fallback), TMA-013 (`s_friend` link), TMA-025 (light and success haptics),
TMA-028 (`openTelegramLink`).

## Storage and analytics

- Storage: none.
- Analytics: no journal event in legacy; the answer itself is product data (API-032). Layer tracking of KV-FE-035
  reports `subs/found` (proposed name, LB-APP-037 fix).

## Files

- `frontend/app/app/(miniapp)/features/radar/FoundSheet.tsx` (new)
- `frontend/packages/ui/src/brand/hooray.webp` (brand asset, FD-8)
- `frontend/app/tests/radar/FoundSheet.test.tsx`, `frontend/app/e2e/found-survey.spec.ts`

## API contract

- API-032 `POST /api/found` `{"answer": "kvadro"|"elsewhere"|"searching"|"stopped", "trigger": "pause"|"delete"}` →
  `204` (ignored).
- API-033 `POST /api/found/where` `{"where": "telegram"|"olx"|"site"|"agent"|"friends"|"street"|"other"}` → `204`
  (ignored).
- Errors (`422`, `401`, `403`, `429`, network) are swallowed; nothing is shown.

## Business rules

- Kept: BR-APP-049, BR-APP-048.
- The decision when to ask (`ask_found`) is server-side (KV-BE-104, Q-API-030); the client never asks on its own.

## Acceptance criteria

- `ask_found: true` after a pause opens the survey with `trigger: "pause"`; after a delete with `trigger: "delete"`.
- «Да, через kvadro²» sends `{answer: "kvadro", trigger}` and shows the congratulations step with the image;
  «Да, в другом месте» → «Где нашли?»; each «where» row sends its code and closes with «Поздравляем! 🎉 …».
- «Рассказать друзьям» is hidden when `meta.bot_username` is `null`.
- A `500` from either endpoint changes nothing visible.
- Visual: step `ask` side by side with the `found-pause` baseline (ru light).

## Tests

- Component: every answer and «where» code sends the right body; toasts per answer; share hidden without bot username.
- E2E (contract mocks): radar pause with `ask_found` → survey → `elsewhere` → `olx` → toast; delete → survey → `kvadro`
  → share opens `t.me/share/url` with the `s_friend` link.

## Edge cases

- The survey is open and the radar list reloads → survey stays (state owned by the tab).
- Both a pause and a delete ask in quick succession → the second replaces the first trigger.
- Outside Telegram (never in production; tests) → share falls back to `navigator.share`, else a new tab.

## Security

- SEC-REQ-019 (only `https://t.me/…` share links), SEC-REQ-014 (answers stored for the requester only, server side).
- No PII in the request bodies (closed enums only).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); visual review of `SCR-031` recorded in the PR; parity
gate G4 for F-DELIVERY-007 ticked (`15` §4); row in `09` updated; PR reviewed by the other developer.
