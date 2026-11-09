# KV-FE-030 — Share and chat-access flows

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-SHARE-001, F-RADAR-008, F-TMA-006 |
| Dependencies | KV-FE-024 (adapter, gates), KV-FE-029 (links), KV-FE-014 (confirm dialog), KV-FE-034 (event journal); consumers: KV-FE-069 (listing share), KV-FE-074 (radar mutations), KV-FE-079 (survey share); bot side KV-TG-015 (parses `s_friend`) |

## Goal

Two reusable flows that hand control to native Telegram sheets (SCR-044): sharing a prepared message (with the legacy
stale-window recovery and link fallbacks) and the write-access flow that turns a radar mutation's `409 no_chat` into
`requestWriteAccess`, one automatic retry, or the «Перезапустить» hint.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:12-70` (`shareMessage` with `WebAppShareMessageOpened` recovery via
  the internal `Telegram.WebView.receiveEvent('prepared_message_failed', {error: 'STALE'})`, `requestWriteAccess`,
  `shareUrl` fallbacks); `$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:15-55` (`isNoChatError`, `withChatAccess`).
- TMA-030 (`shareMessage`, gate 8.0; server prepares via API-017), TMA-031 (share fallbacks), TMA-033
  (`requestWriteAccess`, gate 6.9), SCR-044 (system sheets), SCR-043 (confirm `chat.restart`), `05` §2 (the `409 no_chat`
  seam between bot and Mini App).
- Rules: BR-APP-038 (share only with a known bot username; prepared message 8.0+, else `t.me/share/url`), BR-APP-048
  (turning a radar on goes through the chat-access flow, turning it off does not).
- Links: URL-058 (`https://t.me/share/url?url=…&text=…`), URL-052 (`?startapp=l_<id>`), URL-049 (`?start=s_friend`).

## Implementation

1. `frontend/app/lib/telegram/share.ts`:
   - `canShareMessage()` = `WebApp.shareMessage` exists and gate 8.0;
   - `shareMessage(preparedId): boolean` — call `WebApp.shareMessage(id)`; on an `Error` with message
     `WebAppShareMessageOpened` dispatch the internal `prepared_message_failed` (`STALE`) event and retry once; other
     errors rethrow; returns `false` when unavailable. The internal call depends on SDK internals: wrap it in a guarded
     helper with a unit test that fails loudly if the SDK shape changes (`05` TMA-030 port note);
   - `shareUrl(url, text)` — in Telegram `openTelegramLink('https://t.me/share/url?url=<enc>&text=<enc>')`; outside
     Telegram `navigator.share({url, text})` (rejection ignored), else `window.open(shareLink, '_blank', 'noopener')`.
2. `frontend/app/lib/chatAccess.ts`:
   - `isNoChatError(e)` — `ApiError` (KV-FE-021) with status `409` and `detail === 'no_chat'`;
   - `withChatAccess(request, botUsername)`: run `request()`; on `no_chat` call `requestWriteAccess` (gate 6.9; `null`
     when unavailable); `false` → `chat_access_declined`, rethrow; `true` → `chat_access_allowed`, retry `request()`
     once — success returns, another `no_chat` falls through; unavailable or still `no_chat` → if the bot username is
     known, `showConfirm(t('chat.restart'))` (KV-FE-014) and on OK `openLink('https://t.me/<bot>')`; then rethrow the
     original error so the caller shows `toast.noChat`.
3. A single in-flight guard: a second `withChatAccess` while one waits for the native sheet reuses the pending promise
   (no double sheet).
4. Both modules are UI-less; screens own the buttons, locks and toasts (KV-FE-069 keeps the 1.5 s share lock,
   KV-FE-074 the radar toasts).

## States and texts

| State | Shown by | Text (key, ru) |
| ----- | -------- | -------------- |
| native write-access sheet | Telegram | — (system UI) |
| restart hint | confirm (KV-FE-014) | `chat.restart` «Бот не может писать вам — похоже, он остановлен. Открыть чат с ботом? Нажмите там «Перезапустить» и включите радар снова.» |
| declined / still no chat | toast (caller) | `toast.noChat` «Радар не включён — боту нужно разрешение писать вам в чат» |
| native share picker | Telegram | — (system UI) |
| share fallback | Telegram share screen or browser | the caller's text (KV-FE-069, KV-FE-079) |

## Interaction

- The user leaves the app UI for a native sheet and returns; no state other than the pending promise is kept.
- Share is debounced by the caller (lock during share + 1.5 s, `03` §3.4).

## Telegram integration

TMA-030 (`shareMessage`, gate 8.0, internal stale recovery; result callback and `shareMessageSent`/`shareMessageFailed`
stay unused as legacy), TMA-031 (fallbacks), TMA-033 (`requestWriteAccess`, gate 6.9), TMA-026 (confirm via
KV-FE-014), TMA-028 (`openTelegramLink`), SCR-044 (system sheets triggered by the app).

## Storage and analytics

- Storage: none.
- Journal events (KV-FE-034): `chat_access_declined` (no properties) when `requestWriteAccess` answers `false`;
  `chat_access_allowed` (no properties) when it answers `true`. Share events (`listing_shared`) are sent by KV-FE-069.

## Files

- `frontend/app/lib/telegram/share.ts`, `frontend/app/lib/chatAccess.ts` (new)
- `frontend/app/tests/telegram/share.test.ts`, `frontend/app/tests/chatAccess.test.ts`

## API contract

- Callers' requests: API-019 `POST /api/subscriptions`, API-020 `PUT /api/subscriptions/:id`, API-021 `PATCH …
  {active: true}`, API-023 `POST …/relax` may answer `409 {"detail":"no_chat"}`; any other `409` (limit) is not handled
  here.
- API-017 `POST /api/listings/:id/share` → `200 {"id": string}` gives the prepared message id (called by KV-FE-069).

## Business rules

- Kept: BR-APP-038, BR-APP-048; exactly one automatic retry after consent (`08` §1.6: mutations are never retried
  otherwise).
- No DEV. DEV-009 (server-side radar uniqueness) makes the retry safe on the server; the client never creates twins by
  retrying a `POST` that may have succeeded — the retry happens only after a `409`, which means nothing was created.

## Acceptance criteria

- `no_chat` → consent `true` → retry succeeds: the caller gets the result, `chat_access_allowed` sent once.
- `no_chat` → consent `false`: `chat_access_declined` sent, original error rethrown, no confirm shown.
- Client 6.8 (no `requestWriteAccess`) with a known bot: confirm `chat.restart` shown; OK opens `https://t.me/<bot>`;
  error rethrown.
- Consent `true` but the retry again `no_chat`: confirm shown once, error rethrown.
- `shareMessage` throwing `WebAppShareMessageOpened`: one stale event dispatched, one retry, `true` returned.
- Client 7.10: `canShareMessage()` is `false`; the fallback link is `https://t.me/share/url?url=…&text=…` with both
  parts URL-encoded.

## Tests

- Unit (`chatAccess.test.ts`, fake SDK and fake request): the four consent paths above; non-`no_chat` errors pass
  through untouched; concurrent calls share one native sheet.
- Unit (`share.test.ts`): gate 8.0, stale recovery, other SDK errors rethrown, the three fallback branches.
- E2E (with KV-FE-170): radar create with the mock answering `409 no_chat` then `200` after consent.

## Edge cases

- The bot username is unknown (`meta.bot_username: null`): no restart hint, only the toast.
- The user closes the native sheet without answering: Telegram calls back `false` (treated as declined).
- `navigator.share` exists but rejects (user cancel): ignored silently.

## Security

SEC-REQ-019 (only `https://t.me/…` links built from validated usernames); share text contains no phone number or
`initData`; SEC-REQ-014 (prepared messages are owner-scoped on the server, the client sends only the listing id).

## Definition of done

`make ci-frontend` green; unit tests green (with KV-FE-010); parity gate G4 for F-RADAR-008 and F-TMA-006 ticked
(F-SHARE-001 together with KV-FE-069); `09` rows updated; PR reviewed by the other developer.
